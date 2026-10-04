// Firebase Cloud Messaging. Fully optional: when any VITE_FIREBASE_* variable is missing, or the browser
// lacks Notification / Service Worker / Push support, every export is a harmless no-op.
import { authApi } from './api';

const env = import.meta.env;

const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY || '',
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || '',
  projectId: env.VITE_FIREBASE_PROJECT_ID || '',
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: env.VITE_FIREBASE_APP_ID || '',
};
const VAPID_KEY = env.VITE_FIREBASE_VAPID_KEY || '';

export const isFirebaseConfigured = Object.values(firebaseConfig).every(Boolean) && Boolean(VAPID_KEY);

const browserSupportsPush = () =>
  typeof window !== 'undefined' &&
  'Notification' in window &&
  'serviceWorker' in navigator &&
  'PushManager' in window &&
  window.isSecureContext !== false;

let messagingPromise = null;
let sentTokenFor = null;

async function getMessagingInstance() {
  if (!isFirebaseConfigured || !browserSupportsPush()) return null;
  if (!messagingPromise) {
    messagingPromise = (async () => {
      try {
        const [{ initializeApp, getApps }, messagingModule] = await Promise.all([
          import('firebase/app'),
          import('firebase/messaging'),
        ]);
        if (!(await messagingModule.isSupported())) return null;
        const app = getApps()[0] || initializeApp(firebaseConfig);
        return { messaging: messagingModule.getMessaging(app), mod: messagingModule };
      } catch (e) {
        console.warn('[YIELD WRAP] Firebase messaging unavailable:', e?.message || e);
        return null;
      }
    })();
  }
  return messagingPromise;
}

function serviceWorkerUrl() {
  const params = new URLSearchParams({
    apiKey: firebaseConfig.apiKey,
    authDomain: firebaseConfig.authDomain,
    projectId: firebaseConfig.projectId,
    messagingSenderId: firebaseConfig.messagingSenderId,
    appId: firebaseConfig.appId,
  });
  return `/firebase-messaging-sw.js?${params.toString()}`;
}

/**
 * Ask for notification permission, register the messaging service worker, obtain an FCM token and
 * send it to the backend. Safe to call repeatedly; resolves to the token or null.
 */
export async function enablePushNotifications(userId) {
  try {
    const instance = await getMessagingInstance();
    if (!instance) return null;
    let permission = Notification.permission;
    if (permission === 'default') permission = await Notification.requestPermission();
    if (permission !== 'granted') return null;

    const registration = await navigator.serviceWorker.register(serviceWorkerUrl());
    const token = await instance.mod.getToken(instance.messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: registration,
    });
    if (!token) return null;
    const key = `${userId || 'anon'}:${token}`;
    if (sentTokenFor !== key) {
      await authApi.registerFcmToken(token);
      sentTokenFor = key;
    }
    return token;
  } catch (e) {
    console.warn('[YIELD WRAP] Push notifications not enabled:', e?.message || e);
    return null;
  }
}

/** Subscribe to foreground messages. Returns an unsubscribe function (always callable). */
export async function onForegroundMessage(callback) {
  try {
    const instance = await getMessagingInstance();
    if (!instance) return () => {};
    const unsubscribe = instance.mod.onMessage(instance.messaging, (payload) => {
      try {
        callback?.(payload);
      } catch (e) {
        console.warn('[YIELD WRAP] Foreground message handler failed', e);
      }
    });
    return typeof unsubscribe === 'function' ? unsubscribe : () => {};
  } catch {
    return () => {};
  }
}

export function resetPushState() {
  sentTokenFor = null;
}
