import {
  TELEMETRY_POLICY_VERSION,
  isObject,
  isProductEvent,
  isUuid,
  TELEMETRY_BATCH_LIMIT,
  TELEMETRY_QUEUE_LIMIT,
  type ProductEvent,
  type ProductEventName,
  type ProductEventProps,
} from '@/model/productTelemetry';

import { TELEMETRY_STORAGE_KEY, TELEMETRY_WITHDRAWAL_PREFIX as WITHDRAWAL_KEY } from './storage';
export { TELEMETRY_STORAGE_KEY } from './storage';
export interface TelemetryState {
  available: boolean;
  enabled: boolean;
  busy: boolean;
  pendingWithdrawal: boolean;
  message: string;
  decision?: 'undecided' | 'allowed' | 'snoozed' | 'declined';
  firstOfferedAt?: string | null;
  snoozedUntil?: string | null;
  reminderCount?: number;
  serverNow?: number;
}
interface Consent {
  enabled: boolean;
  revision: string;
  server_time: string;
}
interface Dependencies {
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
  request: (
    token: string,
    body: Record<string, unknown>,
    signal: AbortSignal,
  ) => Promise<{ status: number; body: Record<string, unknown> }>;
  now: () => number;
  uuid: () => string;
  appVersion: string;
  platform: ProductEvent['platform'];
  collectionEnabled: boolean;
  state: TelemetryState;
}

/** No diary objects, SDK session lookup, or throwing product-action promises. */
export class TelemetryQueue {
  private owner = '';
  private token = '';
  private revision = '';
  private generation = 0;
  private events: ProductEvent[] = [];
  private abort = new AbortController();
  private flushing = false;
  private retryAfter = 0;
  private timeOffset = 0;
  constructor(private readonly deps: Dependencies) {}

  private read(key: string): string | null {
    try {
      return this.deps.storage.getItem(key);
    } catch {
      return null;
    }
  }
  private write(key: string, value: string | null) {
    try {
      if (value === null) {
        this.deps.storage.removeItem(key);
      } else {
        this.deps.storage.setItem(key, value);
      }
    } catch {
      /* Storage is optional; failures never reach diary actions. */
    }
  }
  private persist() {
    this.write(TELEMETRY_STORAGE_KEY, JSON.stringify({ owner: this.owner, revision: this.revision, events: this.events }));
  }
  private prune() {
    this.events = this.events.filter((event) => isProductEvent(event, this.deps.now() + this.timeOffset)).slice(-TELEMETRY_QUEUE_LIMIT);
  }
  private restore() {
    const raw = this.read(TELEMETRY_STORAGE_KEY);
    if (!raw) {
      return;
    }
    if (raw.length > 100_000) {
      this.write(TELEMETRY_STORAGE_KEY, null);
      return;
    }
    try {
      const saved: unknown = JSON.parse(raw);
      if (isObject(saved) && saved.owner === this.owner && isUuid(saved.revision) && Array.isArray(saved.events)) {
        this.revision = saved.revision;
        this.events = saved.events.filter((event) => isProductEvent(event, this.deps.now())).slice(-TELEMETRY_QUEUE_LIMIT);
        this.persist();
      } else {
        this.write(TELEMETRY_STORAGE_KEY, null);
      }
    } catch {
      this.write(TELEMETRY_STORAGE_KEY, null);
    }
  }

  setSession(owner: string, token: string) {
    if (!this.owner && !this.deps.collectionEnabled && !this.read(TELEMETRY_STORAGE_KEY) && !this.read(WITHDRAWAL_KEY + owner)) {
      return;
    }
    if (owner === this.owner) {
      this.token = token;
      return;
    }
    const previousOwner = this.owner;
    this.stop();
    this.owner = owner;
    this.token = token;
    if (previousOwner) {
      this.write(TELEMETRY_STORAGE_KEY, null);
    }
    if (owner) {
      this.restore();
    }
    this.deps.state.pendingWithdrawal = !!owner && !!this.read(WITHDRAWAL_KEY + owner);
    if (owner) {
      void this.refresh();
    }
  }
  stop() {
    this.generation++;
    this.abort.abort();
    this.abort = new AbortController();
    this.events = [];
    this.revision = '';
    this.flushing = false;
    this.retryAfter = 0;
    this.owner = '';
    this.token = '';
    Object.assign(this.deps.state, {
      available: false,
      enabled: false,
      busy: false,
      pendingWithdrawal: false,
      message: '',
      decision: undefined,
      firstOfferedAt: undefined,
      snoozedUntil: undefined,
      reminderCount: undefined,
      serverNow: undefined,
    });
  }
  clearDeletedAccount(owner: string) {
    if (owner === this.owner) {
      this.setSession('', '');
    }
    this.write(WITHDRAWAL_KEY + owner, null);
    try {
      const saved = JSON.parse(this.read(TELEMETRY_STORAGE_KEY) ?? 'null');
      if (saved?.owner === owner) {
        this.write(TELEMETRY_STORAGE_KEY, null);
      }
    } catch {
      /* Invalid persisted data is ignored; another account's queue is preserved. */
    }
  }

  private async request(body: Record<string, unknown>) {
    const generation = this.generation;
    const result = await this.deps.request(this.token, body, this.abort.signal);
    if (generation !== this.generation) {
      throw new Error('stale_session');
    }
    if (result.status === 429 || result.status >= 500) {
      this.retryAfter = this.deps.now() + 60_000;
    }
    return result;
  }
  private applyConsent(body: Record<string, unknown>): boolean {
    if (typeof body.enabled !== 'boolean' || !isUuid(body.revision) || typeof body.server_time !== 'string') {
      return false;
    }
    const consent = body as unknown as Consent;
    const knownPolicy = body.policy_version === TELEMETRY_POLICY_VERSION;
    const serverTime = Date.parse(consent.server_time);
    if (!Number.isFinite(serverTime)) {
      return false;
    }
    this.timeOffset = serverTime - this.deps.now();
    if (consent.revision !== this.revision || !consent.enabled || !knownPolicy) {
      this.events = [];
    }
    this.revision = consent.revision;
    this.deps.state.available = knownPolicy;
    this.deps.state.enabled = knownPolicy && consent.enabled && !this.deps.state.pendingWithdrawal;
    this.deps.state.message = '';
    this.deps.state.serverNow = serverTime;
    this.deps.state.decision =
      typeof body.decision === 'string' && ['undecided', 'allowed', 'snoozed', 'declined'].includes(body.decision)
        ? (body.decision as TelemetryState['decision'])
        : undefined;
    this.deps.state.firstOfferedAt = typeof body.first_offered_at === 'string' ? body.first_offered_at : null;
    this.deps.state.snoozedUntil = typeof body.snoozed_until === 'string' ? body.snoozed_until : null;
    this.deps.state.reminderCount = typeof body.reminder_count === 'number' ? body.reminder_count : undefined;
    this.persist();
    return true;
  }
  async refresh() {
    if (!this.owner || !this.token || this.deps.state.busy || this.deps.now() < this.retryAfter) {
      return;
    }
    if (this.deps.state.pendingWithdrawal) {
      await this.withdraw(this.read(WITHDRAWAL_KEY + this.owner) === 'snooze' ? 'snooze' : 'withdraw');
      return;
    }
    const generation = this.generation;
    this.deps.state.busy = true;
    try {
      const result = await this.request({ operation: 'status' });
      if (result.status === 200) {
        this.applyConsent(result.body);
      }
      if (result.status === 401) {
        this.deps.state.enabled = false;
      }
    } catch {
      /* Retry after reconnect or the next scheduled refresh. */
    } finally {
      if (generation === this.generation) {
        this.deps.state.busy = false;
      }
    }
  }
  async grant() {
    if (!this.deps.collectionEnabled || !this.revision || this.deps.state.busy || this.deps.state.pendingWithdrawal) {
      return;
    }
    const generation = this.generation;
    this.deps.state.busy = true;
    try {
      const result = await this.request({ operation: 'grant', revision: this.revision });
      if (result.status !== 200 || !this.applyConsent(result.body) || !this.deps.state.enabled) {
        throw new Error('consent');
      }
      this.deps.state.message = 'Сбор разрешён. События до согласия не отправляются.';
    } catch {
      if (generation === this.generation) {
        this.deps.state.message = 'Не удалось подтвердить согласие. Сбор не включён; обновите состояние и повторите.';
      }
    } finally {
      if (generation === this.generation) {
        this.deps.state.busy = false;
      }
    }
  }
  async offer(operation: 'offer' | 'reminder'): Promise<boolean> {
    if (!this.deps.collectionEnabled || !this.revision || this.deps.state.busy || this.deps.state.pendingWithdrawal) {
      return false;
    }
    const generation = this.generation;
    this.deps.state.busy = true;
    try {
      const result = await this.request({ operation, revision: this.revision });
      return result.status === 200 && this.applyConsent(result.body) && result.body.offered === true;
    } catch {
      return false;
    } finally {
      if (generation === this.generation) {
        this.deps.state.busy = false;
      }
    }
  }
  async withdraw(operation: 'withdraw' | 'snooze' = 'withdraw') {
    if (!this.owner) {
      return;
    }
    // Stop synchronously, abort in-flight ingestion, then retry the server deletion independently.
    this.generation++;
    this.abort.abort();
    this.abort = new AbortController();
    this.flushing = false;
    this.events = [];
    this.deps.state.enabled = false;
    this.deps.state.pendingWithdrawal = true;
    this.deps.state.decision = operation === 'snooze' ? 'snoozed' : 'declined';
    this.write(WITHDRAWAL_KEY + this.owner, operation === 'snooze' ? 'snooze' : 'true');
    this.persist();
    const generation = this.generation;
    this.deps.state.busy = true;
    this.deps.state.message = 'Сбор на этом устройстве остановлен. Удаление на сервере ожидает подтверждения.';
    try {
      const result = await this.request({ operation });
      if (result.status !== 200) {
        return;
      }
      if (!this.applyConsent(result.body) || result.body.enabled) {
        return;
      }
      this.deps.state.pendingWithdrawal = false;
      this.write(WITHDRAWAL_KEY + this.owner, null);
      this.deps.state.message = 'Сбор отключён, персональные продуктовые события удалены с сервера.';
    } catch {
      /* The owner-bound withdrawal marker survives logout, but contains no events. */
    } finally {
      if (generation === this.generation) {
        this.deps.state.busy = false;
      }
    }
  }

  capture<Name extends ProductEventName>(name: Name, props: ProductEventProps[Name]): () => void {
    const generation = this.generation;
    const revision = this.revision;
    const enabled = this.deps.state.enabled && this.deps.collectionEnabled;
    return () => {
      if (!enabled || generation !== this.generation || revision !== this.revision || !this.deps.state.enabled) {
        return;
      }
      try {
        const event = {
          event_id: this.deps.uuid(),
          event_name: name,
          schema_version: 1,
          occurred_at: new Date(this.deps.now() + this.timeOffset).toISOString(),
          app_version: this.deps.appVersion,
          platform: this.deps.platform,
          props,
        };
        if (!isProductEvent(event, this.deps.now() + this.timeOffset)) {
          return;
        }
        this.events.push(event);
        this.prune();
        this.persist();
      } catch {
        /* Telemetry must never fail an explicit product save. */
      }
    };
  }
  async flush() {
    if (!this.owner || !this.token || this.flushing || this.deps.state.busy || this.deps.now() < this.retryAfter) {
      return;
    }
    await this.refresh();
    if (this.flushing || this.deps.now() < this.retryAfter) {
      return;
    }
    if (!this.deps.state.enabled || !this.deps.collectionEnabled || this.deps.state.pendingWithdrawal) {
      return;
    }
    this.prune();
    this.persist();
    const batch = this.events.slice(0, TELEMETRY_BATCH_LIMIT);
    if (!batch.length) {
      return;
    }
    const generation = this.generation;
    this.flushing = true;
    try {
      const result = await this.request({ operation: 'ingest', revision: this.revision, events: batch });
      if (result.status === 200 && Array.isArray(result.body.accepted)) {
        const accepted = new Set(result.body.accepted);
        this.events = this.events.filter((event) => !accepted.has(event.event_id));
      } else if ([400, 401, 403, 409].includes(result.status)) {
        this.events = [];
        this.deps.state.enabled = false;
      }
      this.persist();
    } catch {
      /* Stable ids allow retry after an unknown commit outcome. */
    } finally {
      if (generation === this.generation) {
        this.flushing = false;
      }
    }
  }
  storageChanged(key: string | null) {
    if (key !== TELEMETRY_STORAGE_KEY && key !== WITHDRAWAL_KEY + this.owner) {
      return;
    }
    // Another tab can revoke consent; never merge its events into this tab's session.
    if (this.read(WITHDRAWAL_KEY + this.owner)) {
      this.deps.state.enabled = false;
      this.deps.state.pendingWithdrawal = true;
      this.events = [];
    }
  }
}
