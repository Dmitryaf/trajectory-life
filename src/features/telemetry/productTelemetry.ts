import { reactive } from 'vue';
import type { ProductEventName, ProductEventProps } from '@/model/productTelemetry';
import type { TelemetryQueue, TelemetryState } from './queue';
import { clearDeletedTelemetryState, hasTelemetryState } from './storage';

export const telemetryCollectionEnabled = import.meta.env.VITE_PRODUCT_TELEMETRY_ENABLED === 'true';
export const telemetryState = reactive<TelemetryState>({
  available: false,
  enabled: false,
  busy: false,
  pendingWithdrawal: false,
  message: '',
});
let queue: TelemetryQueue | undefined;
let loading: Promise<void> | undefined;
let session = { owner: '', token: '' };

function setSession(owner: string, token: string) {
  session = { owner, token };
  if (queue) {
    queue.setSession(owner, token);
    return;
  }
  if (!owner || loading || (!telemetryCollectionEnabled && !hasTelemetryState(owner))) {
    return;
  }
  loading = import('./transport')
    .then(({ createTelemetryQueue }) => {
      queue = createTelemetryQueue(telemetryState);
      queue.setSession(session.owner, session.token);
    })
    .catch(() => {
      /* Retry loading on a later refresh; no product action depends on this chunk. */
    })
    .finally(() => {
      loading = undefined;
    });
}
export const productTelemetry = {
  setSession,
  async refresh() {
    setSession(session.owner, session.token);
    await loading;
    await queue?.refresh();
  },
  async flush() {
    setSession(session.owner, session.token);
    await loading;
    await queue?.flush();
  },
  async grant() {
    await queue?.grant();
  },
  async withdraw() {
    await queue?.withdraw();
  },
  async snooze() {
    await queue?.withdraw('snooze');
  },
  async offer(kind: 'offer' | 'reminder') {
    return (await queue?.offer(kind)) ?? false;
  },
  storageChanged(key: string | null) {
    queue?.storageChanged(key);
  },
  stop() {
    session = { owner: '', token: '' };
    queue?.stop();
  },
  clearDeletedAccount(owner: string) {
    if (session.owner === owner) {
      session = { owner: '', token: '' };
    }
    queue?.clearDeletedAccount(owner);
    clearDeletedTelemetryState(owner);
  },
};
export function captureProductEvent<Name extends ProductEventName>(name: Name, props: ProductEventProps[Name]): () => void {
  return queue?.capture(name, props) ?? (() => {});
}
export function emitProductEvent<Name extends ProductEventName>(name: Name, props: ProductEventProps[Name]): void {
  captureProductEvent(name, props)();
}
