// Offline play: registers the service worker that offline.vite.ts generates with each
// production build. When a new build takes over an open page, the page reloads once onto it, so
// it never runs a mix of two builds; a page that is on the current build tells the worker to drop
// older caches.
export function enableOffline(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  const sw = navigator.serviceWorker;
  const hadController = sw.controller !== null;
  let reloading = false;
  sw.addEventListener('controllerchange', () => {
    // The first install takes control of a page that already runs this build: nothing to reload.
    if (!hadController || reloading) return;
    reloading = true;
    location.reload();
  });
  sw.register('./sw.js')
    .then(() => sw.ready)
    .then((reg) => reg.active?.postMessage('prune'))
    .catch((err) => console.error('offline: service worker registration failed', err));
}
