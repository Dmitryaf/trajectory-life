export function observePublicPageUpdates(isPublicPage: () => boolean, reload = () => window.location.reload()) {
  const serviceWorker = navigator.serviceWorker;
  let hadController = Boolean(serviceWorker?.controller);
  let updated = false;
  let reloading = false;
  let checking = false;
  let lastCheck = -Infinity;
  let stopped = false;

  function onUpdate() {
    updated = true;
    if (isPublicPage() && !reloading && !stopped) {
      reloading = true;
      reload();
    }
  }

  function onControllerChange() {
    if (hadController) {
      onUpdate();
    }
    hadController = Boolean(serviceWorker?.controller);
  }

  function check() {
    if (stopped || !isPublicPage()) {
      return;
    }
    if (updated) {
      onUpdate();
      return;
    }
    if (!serviceWorker?.controller || checking || Date.now() - lastCheck < 60_000) {
      return;
    }
    lastCheck = Date.now();
    checking = true;
    void serviceWorker
      .getRegistration()
      .then((registration) => registration?.update())
      .catch(() => undefined)
      .finally(() => {
        checking = false;
      });
  }

  function onVisibilityChange() {
    if (document.visibilityState === 'visible') {
      check();
    }
  }

  serviceWorker?.addEventListener('controllerchange', onControllerChange);
  window.addEventListener('focus', check);
  document.addEventListener('visibilitychange', onVisibilityChange);
  return {
    check,
    onUpdate,
    stop() {
      stopped = true;
      serviceWorker?.removeEventListener('controllerchange', onControllerChange);
      window.removeEventListener('focus', check);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    },
  };
}
