export type ClientErrorCode = 'ACTION_FAILED' | 'APP_DATA_LOAD_FAILED' | 'UNHANDLED_ERROR' | 'UNHANDLED_REJECTION';

type AccessTokenProvider = () => string;

const routeNames: Record<string, string> = {
  '/today': 'today',
  '/results': 'results',
  '/events': 'events',
  '/week': 'week',
  '/month': 'month',
  '/trends': 'trends',
  '/more': 'more',
  '/settings': 'settings',
  '/password-reset': 'password-reset',
  '/data-policy': 'data-policy',
};
const sentRecently = new Map<string, number>();
const deduplicationWindowMs = 60_000;
let accessTokenProvider: AccessTokenProvider = () => '';
let stopGlobalObservation: (() => void) | undefined;

function currentRoute(): string {
  return routeNames[window.location.pathname] ?? 'unknown';
}

export function configureErrorMonitoring(provider: AccessTokenProvider, enabled = true): () => void {
  if (!enabled) {
    return () => undefined;
  }
  accessTokenProvider = provider;
  if (stopGlobalObservation) {
    return stopGlobalObservation;
  }

  const handleError = () => reportClientError('UNHANDLED_ERROR');
  const handleUnhandledRejection = () => reportClientError('UNHANDLED_REJECTION');
  window.addEventListener('error', handleError);
  window.addEventListener('unhandledrejection', handleUnhandledRejection);

  stopGlobalObservation = () => {
    window.removeEventListener('error', handleError);
    window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    accessTokenProvider = () => '';
    stopGlobalObservation = undefined;
  };
  return stopGlobalObservation;
}

export function reportClientError(code: ClientErrorCode): void {
  const accessToken = accessTokenProvider();
  if (!accessToken) {
    return;
  }

  const route = currentRoute();
  const deduplicationKey = `${code}:${route}`;
  const now = Date.now();
  if (now - (sentRecently.get(deduplicationKey) ?? 0) < deduplicationWindowMs) {
    return;
  }
  sentRecently.set(deduplicationKey, now);

  void fetch('/api/client-error', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ code, route }),
  }).catch(() => undefined);
}
