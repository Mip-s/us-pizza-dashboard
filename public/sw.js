/* eslint-disable no-restricted-globals */
// Service worker for Web Push notifications (US Pizza Operations hub + POS Uptime Monitor).
// The same file is served at the root of BOTH sites: the hub (static/sw.js) and the uptime
// Worker (public/sw.js). Keep the two copies identical.

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

// Tap on a notification: open the page the alert points to (e.g. /uptime).
// Reuse an open window of this site if there is one, otherwise open a new one.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (clientList) => {
      const same = clientList.find((c) => c.url === target);
      if (same && 'focus' in same) return same.focus();
      const any = clientList.find((c) => c.url.startsWith(self.location.origin));
      if (any && 'navigate' in any) {
        const c = await any.navigate(target);
        return (c || any).focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
    })
  );
});
