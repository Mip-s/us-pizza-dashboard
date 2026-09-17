/* eslint-disable no-restricted-globals */
// Service worker for Web Push notifications on the US Pizza Operations dashboard.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Fired when the browser receives a push message from the server.
self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (err) {
    payload = { title: 'US Pizza Operations', body: event.data ? event.data.text() : 'New alert' };
  }

  const title = payload.title || 'US Pizza Operations';
  const options = {
    body: payload.body || 'An outlet status has changed.',
    icon: '/logo192.png',
    badge: '/logo192.png',
    data: { url: payload.url || '/' },
    tag: payload.tag || undefined,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Focus/open the dashboard when the user clicks the notification.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
