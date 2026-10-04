export const TELEMETRY_STORAGE_KEY = 'trajectory:product-telemetry:v1';
export const TELEMETRY_WITHDRAWAL_PREFIX = 'trajectory:telemetry-withdrawal:';

export function hasTelemetryState(owner: string): boolean {
  try {
    return !!localStorage.getItem(TELEMETRY_STORAGE_KEY) || !!localStorage.getItem(TELEMETRY_WITHDRAWAL_PREFIX + owner);
  } catch {
    return false;
  }
}
export function clearDeletedTelemetryState(owner: string) {
  try {
    localStorage.removeItem(TELEMETRY_WITHDRAWAL_PREFIX + owner);
    const raw = localStorage.getItem(TELEMETRY_STORAGE_KEY);
    if (raw && JSON.parse(raw).owner === owner) {
      localStorage.removeItem(TELEMETRY_STORAGE_KEY);
    }
  } catch {
    /* Optional storage never blocks account deletion. */
  }
}
