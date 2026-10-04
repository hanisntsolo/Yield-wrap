/* global importScripts, firebase */
// Background FCM handler. Config is passed via query string when registered:
//   /firebase-messaging-sw.js?apiKey=...&projectId=...&messagingSenderId=...&appId=...
// If config is missing, this worker does nothing (no crash).
const params = new URL(self.location.href).searchParams;
const config = {
  apiKey: params.get('apiKey'),
  authDomain: params.get('authDomain'),
  projectId: params.get('projectId'),
  messagingSenderId: params.get('messagingSenderId'),
  appId: params.get('appId'),
};

if (config.apiKey && config.projectId && config.messagingSenderId && config.appId) {
  try {
    importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
    importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');
    firebase.initializeApp(config);
    const messaging = firebase.messaging();
    messaging.onBackgroundMessage((payload) => {
      const n = payload.notification || {};
      const title = n.title || (payload.data && payload.data.title) || 'YIELD WRAP';
      self.registration.showNotification(title, {
        body: n.body || (payload.data && payload.data.body) || '',
        icon: '/favicon.svg',
        data: payload.data || {},
      });
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[YIELD WRAP SW] Firebase init failed', e);
  }
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) { if ('focus' in c) return c.focus(); }
      if (self.clients.openWindow) return self.clients.openWindow('/');
      return undefined;
    })
  );
});
