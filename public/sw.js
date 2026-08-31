self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', () => {
  // Pas de mise en cache offline pour l'instant — juste la présence
  // du service worker suffit pour rendre l'app installable.
});
