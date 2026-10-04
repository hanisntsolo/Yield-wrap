// Shared constants. Tailwind class strings are written out in full so the JIT compiler can see them.

export const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/\/+$/, '');
export const WS_URL = API_URL.replace(/^http/i, 'ws');

export const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';
export const HAS_GOOGLE_MAPS = Boolean(GOOGLE_MAPS_API_KEY);
export const ADSENSE_CLIENT = import.meta.env.VITE_ADSENSE_CLIENT || '';

export const ROLES = {
  DONOR: 'donor',
  NGO: 'ngo',
  VOLUNTEER: 'volunteer',
  BUSINESS: 'business',
  ADMIN: 'admin',
};

export const ROLE_OPTIONS = [
  {
    value: 'donor',
    label: 'Donor',
    icon: 'utensils',
    description: 'Restaurants, caterers, stores and households with surplus food.',
  },
  {
    value: 'ngo',
    label: 'NGO',
    icon: 'building',
    description: 'Food banks, shelters and community kitchens receiving food.',
  },
  {
    value: 'volunteer',
    label: 'Volunteer',
    icon: 'truck',
    description: 'Pick up surplus and deliver it where it is needed most.',
  },
  {
    value: 'business',
    label: 'Business',
    icon: 'megaphone',
    description: 'Brands that sponsor food packaging, NGO posters and digital ads.',
  },
  {
    value: 'admin',
    label: 'Admin',
    icon: 'shield',
    description: 'Platform operators. Requires an admin sign-up code.',
  },
];

export const ROLE_LABELS = {
  donor: 'Donor',
  ngo: 'NGO',
  volunteer: 'Volunteer',
  business: 'Business',
  admin: 'Admin',
};

export const DASHBOARD_PATH = {
  donor: '/donor',
  ngo: '/ngo',
  volunteer: '/volunteer',
  business: '/business',
  admin: '/admin',
};

export const dashboardPathFor = (role) => DASHBOARD_PATH[role] || '/';

export const FOOD_CATEGORIES = [
  { value: 'cooked', label: 'Cooked meals' },
  { value: 'raw', label: 'Raw ingredients' },
  { value: 'packaged', label: 'Packaged goods' },
  { value: 'dairy', label: 'Dairy' },
  { value: 'produce', label: 'Fresh produce' },
];

export const FOOD_CATEGORY_LABELS = Object.fromEntries(FOOD_CATEGORIES.map((c) => [c.value, c.label]));

export const COMMON_ALLERGENS = ['gluten', 'dairy', 'nuts', 'eggs', 'soy', 'shellfish', 'fish', 'sesame'];

export const URGENCY_LEVELS = [
  {
    value: 'low',
    label: 'Low',
    hex: '#27AE60',
    badge: 'bg-urgency-low/15 text-urgency-low ring-urgency-low/30',
    active: 'bg-urgency-low text-white border-urgency-low',
  },
  {
    value: 'medium',
    label: 'Medium',
    hex: '#F39C12',
    badge: 'bg-urgency-medium/15 text-[#B9770E] ring-urgency-medium/30',
    active: 'bg-urgency-medium text-white border-urgency-medium',
  },
  {
    value: 'high',
    label: 'High',
    hex: '#E67E22',
    badge: 'bg-urgency-high/15 text-[#AF601A] ring-urgency-high/30',
    active: 'bg-urgency-high text-white border-urgency-high',
  },
  {
    value: 'critical',
    label: 'Critical',
    hex: '#E74C3C',
    badge: 'bg-urgency-critical/15 text-urgency-critical ring-urgency-critical/30',
    active: 'bg-urgency-critical text-white border-urgency-critical',
  },
];

export const URGENCY_META = Object.fromEntries(URGENCY_LEVELS.map((u) => [u.value, u]));

export const DONATION_STATUSES = {
  pending: {
    label: 'Pending',
    hex: '#F39C12',
    badge: 'bg-status-pending/15 text-[#B9770E] ring-status-pending/30',
    dot: 'bg-status-pending',
  },
  matched: {
    label: 'Matched',
    hex: '#3498DB',
    badge: 'bg-status-matched/15 text-[#21618C] ring-status-matched/30',
    dot: 'bg-status-matched',
  },
  in_transit: {
    label: 'In transit',
    hex: '#9B59B6',
    badge: 'bg-status-in_transit/15 text-[#76448A] ring-status-in_transit/30',
    dot: 'bg-status-in_transit',
  },
  delivered: {
    label: 'Delivered',
    hex: '#2ECC71',
    badge: 'bg-status-delivered/15 text-[#1D8348] ring-status-delivered/30',
    dot: 'bg-status-delivered',
  },
  expired: {
    label: 'Expired',
    hex: '#E74C3C',
    badge: 'bg-status-expired/15 text-status-expired ring-status-expired/30',
    dot: 'bg-status-expired',
  },
  cancelled: {
    label: 'Cancelled',
    hex: '#95A5A6',
    badge: 'bg-status-cancelled/15 text-[#5F6A6A] ring-status-cancelled/30',
    dot: 'bg-status-cancelled',
  },
};

export const STATUS_OPTIONS = Object.entries(DONATION_STATUSES).map(([value, meta]) => ({ value, label: meta.label }));

export const VEHICLE_TYPES = [
  { value: 'bike', label: 'Bike', travelMode: 'bicycling' },
  { value: 'car', label: 'Car', travelMode: 'driving' },
  { value: 'van', label: 'Van', travelMode: 'driving' },
  { value: 'on_foot', label: 'On foot', travelMode: 'walking' },
];

export const VEHICLE_LABELS = Object.fromEntries(VEHICLE_TYPES.map((v) => [v.value, v.label]));

// Volunteer task lifecycle, in order.
export const TASK_STAGES = [
  { value: 'assigned', label: 'Assigned' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'at_pickup', label: 'At pickup' },
  { value: 'picked_up', label: 'Food collected' },
  { value: 'delivered', label: 'Delivered' },
];

export const TASK_STAGE_LABELS = Object.fromEntries(TASK_STAGES.map((s) => [s.value, s.label]));
export const TASK_STAGE_ORDER = TASK_STAGES.map((s) => s.value);

// Next status a volunteer can move a task to, keyed by the current stage.
export const NEXT_TASK_ACTION = {
  accepted: { status: 'at_pickup', label: 'Arrived at Pickup', icon: 'map-pin' },
  at_pickup: { status: 'picked_up', label: 'Food Collected', icon: 'package' },
  picked_up: { status: 'delivered', label: 'Delivered', icon: 'check-circle' },
};

export const ACTIVE_TASK_STAGES = ['accepted', 'at_pickup', 'picked_up'];

export const MARKER_COLORS = {
  donation: '#F39C12',
  pickup: '#F39C12',
  delivery: '#1A7A4A',
  ngo: '#1A7A4A',
  volunteer: '#2a78d6',
};

// Categorical chart palette (validated all-pairs for CVD + normal vision on a light surface).
export const CHART_COLORS = ['#1A7A4A', '#2a78d6', '#F39C12', '#4a3aa7', '#e87ba4'];

export const AD_SLOTS = {
  leaderboard: { width: 728, height: 90 },
  rectangle: { width: 300, height: 250 },
  mobile: { width: 320, height: 50 },
};

export const BUSINESS_TYPES = [
  { value: 'restaurant', label: 'Restaurant' },
  { value: 'hotel', label: 'Hotel' },
  { value: 'cafe', label: 'Cafe' },
  { value: 'caterer', label: 'Caterer' },
  { value: 'retail', label: 'Retail' },
  { value: 'other', label: 'Other' },
];

export const ADVERTISER_ROLES = ['donor', 'business', 'admin'];

export const RAZORPAY_CHECKOUT_SRC = 'https://checkout.razorpay.com/v1/checkout.js';

export const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg'];

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const ALLOWED_DOC_TYPES = ['application/pdf', 'image/png', 'image/jpeg'];
export const ALLOWED_DOC_EXTENSIONS = ['.pdf', '.png', '.jpg', '.jpeg'];

export const DEFAULT_MAP_CENTER = { lat: 20.5937, lng: 78.9629 };

export const POLL = {
  unreadCount: 20000,
  dashboard: 15000,
  tracking: 15000,
  ngoDonations: 20000,
  volunteerTasks: 15000,
  adminMap: 20000,
};
