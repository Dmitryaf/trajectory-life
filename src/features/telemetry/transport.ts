import { TelemetryQueue, type TelemetryState } from './queue';
// Coarse platform only. The user-agent string never leaves the browser through this feature.
function platform(): 'web' | 'ios' | 'android' {
  if (/Android/i.test(navigator.userAgent)) {
    return 'android';
  }
  if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) {
    return 'ios';
  }
  return 'web';
}
export function createTelemetryQueue(state: TelemetryState) {
  return new TelemetryQueue({
    storage: {
      getItem: (key) => localStorage.getItem(key),
      setItem: (key, value) => localStorage.setItem(key, value),
      removeItem: (key) => localStorage.removeItem(key),
    },
    now: () => Date.now(),
    uuid: () => crypto.randomUUID(),
    appVersion: import.meta.env.VITE_APP_VERSION,
    platform: typeof navigator === 'undefined' ? 'web' : platform(),
    collectionEnabled: import.meta.env.VITE_PRODUCT_TELEMETRY_ENABLED === 'true',
    state,
    request: async (token, body, signal) => {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/product-events`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? '',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal,
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
      });
      return { status: response.status, body: await response.json() };
    },
  });
}
