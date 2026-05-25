/* Projexino Web Push service worker — native W3C Push API (no Firebase).
   Served at /webpush-sw.js from the site root.
   Handles `push` events (background notification) and `notificationclick`. */
/* eslint-disable */

self.addEventListener('install', (e) => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = { title: 'Projexino', body: event.data ? event.data.text() : '' }; }
  const title = data.title || 'Projexino';
  const body  = data.body  || '';
  const link  = data.link  || '/app';
  const tag   = data.tag   || 'projexino-default';
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/logo192.png',
      badge: '/logo192.png',
      data: { link },
      tag,
      renotify: true,
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link = (event.notification.data && event.notification.data.link) || '/app';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((all) => {
      for (const c of all) {
        try {
          if (c.url.includes(self.registration.scope) && 'focus' in c) {
            c.navigate(link); return c.focus();
          }
        } catch (e) {}
      }
      if (self.clients.openWindow) return self.clients.openWindow(link);
    })
  );
});
