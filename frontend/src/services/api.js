import axios from 'axios';
import { API_URL } from '../utils/constants';

// JWTs live only in httpOnly cookies set by the backend; nothing is ever stored client-side.
const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  timeout: 30000,
  headers: { Accept: 'application/json' },
});

const NO_REFRESH_PATHS = ['/api/auth/login', '/api/auth/register', '/api/auth/refresh', '/api/auth/logout'];
const REFRESHABLE_CODES = new Set(['TOKEN_EXPIRED', 'UNAUTHORIZED', 'NOT_AUTHENTICATED', 'INVALID_TOKEN', 'HTTP_401']);

let refreshPromise = null;
let authFailureHandler = null;

/** Registered by AuthContext: invoked when a refresh attempt fails so auth state can be cleared. */
export function setAuthFailureHandler(fn) {
  authFailureHandler = typeof fn === 'function' ? fn : null;
}

const isNoRefreshPath = (url = '') => NO_REFRESH_PATHS.some((p) => url.includes(p));

/** One shared refresh call, no matter how many requests failed concurrently. */
export function refreshSession() {
  if (!refreshPromise) {
    refreshPromise = api
      .post('/api/auth/refresh', null, { _skipAuthRefresh: true })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error?.config;
    const status = error?.response?.status;
    const code = error?.response?.data?.code;
    const refreshable = status === 401 && (!code || REFRESHABLE_CODES.has(code));

    if (!original || !refreshable || original._retried || original._skipAuthRefresh || isNoRefreshPath(original.url)) {
      return Promise.reject(error);
    }

    original._retried = true;
    try {
      await refreshSession();
    } catch (refreshError) {
      if (authFailureHandler) authFailureHandler(refreshError);
      return Promise.reject(error);
    }
    return api(original);
  },
);

/** Pull the backend's `{error, code, details}` out of an axios error (or anything thrown). */
export function getApiError(err, fallback = 'Something went wrong. Please try again.') {
  if (!err) return { error: fallback, code: 'UNKNOWN', status: null, details: [] };
  const res = err.response;
  if (!res) {
    if (err.code === 'ECONNABORTED') return { error: 'The request timed out. Please retry.', code: 'TIMEOUT', status: null, details: [] };
    if (err.message === 'Network Error' || err.code === 'ERR_NETWORK') {
      return { error: 'Cannot reach the server. Check your connection.', code: 'NETWORK_ERROR', status: null, details: [] };
    }
    return { error: err.message || fallback, code: err.code || 'UNKNOWN', status: null, details: [] };
  }
  const data = res.data;
  let message = fallback;
  if (data && typeof data === 'object' && !(data instanceof Blob)) {
    if (typeof data.error === 'string') message = data.error;
    else if (typeof data.detail === 'string') message = data.detail;
    else if (typeof data.message === 'string') message = data.message;
  }
  return {
    error: message,
    code: data?.code || `HTTP_${res.status}`,
    status: res.status,
    details: Array.isArray(data?.details) ? data.details : [],
  };
}

/** Human-readable message for toasts. */
export const errorMessage = (err, fallback) => getApiError(err, fallback).error;

/** Map 422 `details` -> { fieldName: message } using the last path segment and full dotted path. */
export function fieldErrors(err) {
  const { details } = getApiError(err);
  const out = {};
  details.forEach((d) => {
    const field = String(d?.field ?? d?.loc?.join?.('.') ?? '');
    if (!field) return;
    const msg = d?.message || d?.msg || 'Invalid value';
    out[field] = msg;
    const leaf = field.split('.').pop();
    if (leaf && !out[leaf]) out[leaf] = msg;
  });
  return out;
}

const data = (p) => p.then((r) => r.data);
const enc = encodeURIComponent;

export const authApi = {
  me: () => data(api.get('/api/auth/me')),
  login: (body) => data(api.post('/api/auth/login', body)),
  register: (body) => data(api.post('/api/auth/register', body)),
  logout: () => data(api.post('/api/auth/logout')),
  updateMe: (body) => data(api.put('/api/auth/me', body)),
  uploadNgoDocument: (file, onUploadProgress) => {
    const form = new FormData();
    form.append('file', file);
    return data(api.post('/api/auth/ngo-document', form, { onUploadProgress }));
  },
  registerFcmToken: (token) => data(api.post('/api/auth/fcm-token', { token })),
};

export const donorApi = {
  createDonation: (body) => data(api.post('/api/donor/donations', body)),
  listDonations: () => data(api.get('/api/donor/donations')),
  getDonation: (id) => data(api.get(`/api/donor/donations/${enc(id)}`)),
  updateDonation: (id, body) => data(api.put(`/api/donor/donations/${enc(id)}`, body)),
  cancelDonation: (id) => data(api.delete(`/api/donor/donations/${enc(id)}`)),
  track: (id) => data(api.get(`/api/donor/donations/${enc(id)}/track`)),
  stats: () => data(api.get('/api/donor/stats')),
};

export const ngoApi = {
  profile: () => data(api.get('/api/ngo/profile')),
  updateProfile: (body) => data(api.put('/api/ngo/profile', body)),
  availableDonations: () => data(api.get('/api/ngo/available-donations')),
  accept: (id) => data(api.post(`/api/ngo/accept/${enc(id)}`)),
  decline: (id) => data(api.post(`/api/ngo/decline/${enc(id)}`)),
  incoming: () => data(api.get('/api/ngo/incoming')),
  updateCapacity: (body) => data(api.put('/api/ngo/capacity', body)),
  history: () => data(api.get('/api/ngo/history')),
  historyCsv: () => api.get('/api/ngo/history.csv', { responseType: 'blob' }),
};

export const volunteerApi = {
  profile: () => data(api.get('/api/volunteer/profile')),
  setAvailability: (availability) => data(api.put('/api/volunteer/availability', { availability })),
  tasks: () => data(api.get('/api/volunteer/tasks')),
  acceptTask: (id) => data(api.post(`/api/volunteer/tasks/${enc(id)}/accept`)),
  declineTask: (id) => data(api.post(`/api/volunteer/tasks/${enc(id)}/decline`)),
  updateTaskStatus: (id, body) => data(api.put(`/api/volunteer/tasks/${enc(id)}/status`, body)),
  updateLocation: (lat, lng) => data(api.put('/api/volunteer/location', { lat, lng })),
  history: () => data(api.get('/api/volunteer/history')),
  leaderboard: () => data(api.get('/api/volunteer/leaderboard')),
};

export const adminApi = {
  users: ({ role, q } = {}) => data(api.get('/api/admin/users', { params: { role: role || undefined, q: q || undefined } })),
  verifyUser: (id, isVerified) => data(api.put(`/api/admin/users/${enc(id)}/verify`, { is_verified: isVerified })),
  suspendUser: (id, isSuspended) => data(api.put(`/api/admin/users/${enc(id)}/suspend`, { is_suspended: isSuspended })),
  deleteUser: (id) => data(api.delete(`/api/admin/users/${enc(id)}`)),
  donations: (status) => data(api.get('/api/admin/donations', { params: { status: status || undefined } })),
  systemStats: () => data(api.get('/api/admin/system-stats')),
  broadcast: (body) => data(api.post('/api/admin/broadcast', body)),
  map: () => data(api.get('/api/admin/map')),
  adCreatives: (status = 'pending') => data(api.get('/api/admin/ad-creatives', { params: { status: status || undefined } })),
  reviewCreative: (id, approved, reason) => data(api.put(`/api/admin/ad-creatives/${enc(id)}/review`, { approved, reason: reason || undefined })),
  adRevenue: () => data(api.get('/api/admin/ad-revenue')),
  grantCredits: (userId, credits, note) => data(api.post(`/api/admin/users/${enc(userId)}/credits`, { credits, note })),
};

export const aiApi = {
  match: (donationId) => data(api.post(`/api/ai/match/${enc(donationId)}`)),
  forecast: (days = 7) => data(api.get('/api/ai/forecast', { params: { days } })),
  route: (body) => data(api.post('/api/ai/route', body)),
  routeMulti: (body) => data(api.post('/api/ai/route/multi', body)),
  allocateVolunteer: (donationId) => data(api.post('/api/ai/allocate-volunteer', { donation_id: donationId })),
  priorityQueue: () => data(api.get('/api/ai/priority-queue')),
};

export const analyticsApi = {
  publicImpact: () => data(api.get('/api/analytics/public-impact', { _skipAuthRefresh: true })),
  dashboard: () => data(api.get('/api/analytics/dashboard')),
  trend: (period = 'daily', days = 30) => data(api.get('/api/analytics/donations/trend', { params: { period, days } })),
  foodTypes: () => data(api.get('/api/analytics/food-types')),
  volunteerPerformance: (limit = 10) => data(api.get('/api/analytics/volunteer-performance', { params: { limit } })),
  ngoUtilization: () => data(api.get('/api/analytics/ngo-utilization')),
  wasteSaved: () => data(api.get('/api/analytics/waste-saved')),
};

export const notificationsApi = {
  list: () => data(api.get('/api/notifications/')),
  unreadCount: () => data(api.get('/api/notifications/unread-count')),
  markRead: (id) => data(api.post(`/api/notifications/${enc(id)}/read`)),
  markAllRead: () => data(api.post('/api/notifications/read-all')),
};

export const adsApi = {
  get: (slot, page) => data(api.get('/api/ads/', { params: { slot, page } })),
  impression: (body) => data(api.post('/api/ads/impression', body)),
  click: (body) => data(api.post('/api/ads/click', body)),
  partners: () => data(api.get('/api/ads/partners')),
};

/** Packaging ad-tech: wallet, Razorpay orders, creatives, campaigns, inventory and NGO spaces (advertiser side). */
export const adMarketApi = {
  pricing: () => data(api.get('/api/ads/pricing')),
  wallet: () => data(api.get('/api/ads/wallet')),
  createOrder: (packId) => data(api.post('/api/ads/orders', { pack_id: packId })),
  verifyOrder: (orderId, body = {}) => data(api.post(`/api/ads/orders/${enc(orderId)}/verify`, body)),
  creatives: (params) => data(api.get('/api/ads/creatives', { params })),
  uploadCreative: ({ title, tagline, url, image }, onUploadProgress) => {
    const form = new FormData();
    form.append('title', title);
    if (tagline) form.append('tagline', tagline);
    if (url) form.append('url', url);
    if (image) form.append('image', image);
    return data(api.post('/api/ads/creatives', form, { onUploadProgress }));
  },
  deleteCreative: (id) => data(api.delete(`/api/ads/creatives/${enc(id)}`)),
  campaigns: () => data(api.get('/api/ads/campaigns')),
  createCampaign: (body) => data(api.post('/api/ads/campaigns', body)),
  cancelCampaign: (id) => data(api.post(`/api/ads/campaigns/${enc(id)}/cancel`)),
  inventory: () => data(api.get('/api/ads/inventory')),
  spaces: ({ lat, lng, radiusKm } = {}) =>
    data(api.get('/api/ads/spaces', { params: { lat: lat ?? undefined, lng: lng ?? undefined, radius_km: radiusKm ?? undefined } })),
  stickers: (donationId) => data(api.get(`/api/ads/stickers/${enc(donationId)}`)),
};

export const walletApi = {
  get: adMarketApi.wallet,
  createOrder: adMarketApi.createOrder,
  verifyOrder: adMarketApi.verifyOrder,
};

export const ngoAdsApi = {
  spaces: () => data(api.get('/api/ngo/ad-spaces')),
  createSpace: (body) => data(api.post('/api/ngo/ad-spaces', body)),
  updateSpace: (id, body) => data(api.put(`/api/ngo/ad-spaces/${enc(id)}`, body)),
  deleteSpace: (id) => data(api.delete(`/api/ngo/ad-spaces/${enc(id)}`)),
  bookings: () => data(api.get('/api/ngo/ad-bookings')),
  markDisplayed: (campaignId) => data(api.post(`/api/ngo/ad-bookings/${enc(campaignId)}/displayed`)),
  decline: (campaignId) => data(api.post(`/api/ngo/ad-bookings/${enc(campaignId)}/decline`)),
};

/** Turn a relative API path (e.g. NGO document_url) into an absolute URL. */
export function apiUrl(path) {
  if (!path) return '';
  if (/^https?:\/\//i.test(path)) return path;
  return `${API_URL}${path.startsWith('/') ? '' : '/'}${path}`;
}

/** Unwrap list responses that may be a bare array or wrapped ({items}, {donations}, …). */
export function asList(value, ...keys) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== 'object') return [];
  for (const k of [...keys, 'items', 'results', 'data']) {
    if (Array.isArray(value[k])) return value[k];
  }
  return [];
}

export default api;
