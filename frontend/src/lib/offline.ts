// Bump with sw.js so browsers fetch and install the updated worker.
const OFFLINE_SHELL_VERSION = '2';

export function registerOfflineShell(): void {
  if (import.meta.env.MODE !== 'cloud' || !('serviceWorker' in navigator)) {
    return;
  }
  window.addEventListener('load', () => {
    const base = new URL('./', document.baseURI);
    void navigator.serviceWorker
      .register(new URL(`sw.js?v=${OFFLINE_SHELL_VERSION}`, base).href, {
        scope: base.pathname,
      })
      .catch(() => {
        // Offline support is an enhancement; the online app still works.
      });
  });
}
