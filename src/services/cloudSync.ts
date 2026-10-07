import {
  AuthApiError,
  AuthRetryableFetchError,
  createClient,
  isAuthRetryableFetchError,
  type AuthChangeEvent,
  type Session,
  type SupabaseClient,
} from '@supabase/supabase-js';
import { CloudOperationCancelledError, type CloudOperationScope } from './cloudOperation';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const signupEnabled = import.meta.env.VITE_ENABLE_SIGNUP === 'true';
const cloudAuthRequired = import.meta.env.VITE_REQUIRE_AUTH === 'true';

let client: SupabaseClient | null = null;
const startupRequestTimeoutMs = 5_000;
const cloudRequestTimeoutMs = 10_000;

function cloudAuthStorageKey(): string {
  return `sb-${new URL(supabaseUrl!).hostname.split('.')[0]}-auth-token`;
}

export function getCachedCloudSession(): Session | null {
  if (!isCloudSyncConfigured()) {
    return null;
  }
  try {
    const cached: unknown = JSON.parse(window.localStorage.getItem(cloudAuthStorageKey()) ?? 'null');
    if (!cached || typeof cached !== 'object') {
      return null;
    }
    const session = cached as Partial<Session>;
    if (
      typeof session.access_token !== 'string' ||
      !session.access_token ||
      typeof session.refresh_token !== 'string' ||
      !session.refresh_token ||
      typeof session.expires_at !== 'number' ||
      !Number.isFinite(session.expires_at) ||
      typeof session.user?.id !== 'string' ||
      !session.user.id
    ) {
      return null;
    }
    return session as Session;
  } catch {
    return null;
  }
}

export function invalidateCachedCloudSession(session: Session | null): void {
  if (!session) {
    return;
  }
  const cached = getCachedCloudSession();
  if (cached?.access_token === session.access_token && cached.user.id === session.user.id) {
    window.localStorage.removeItem(cloudAuthStorageKey());
  }
}

function ownedActiveCachedSession(): Session | null {
  const session = getCachedCloudSession();
  if (!session || session.expires_at! * 1000 <= Date.now()) {
    return null;
  }
  try {
    return window.localStorage.getItem('trajectory:local-owner-id') === session.user.id ? session : null;
  } catch {
    return null;
  }
}

function fetchCloudRequest(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return Promise.reject(new TypeError('Network is offline'));
  }
  const controller = new AbortController();
  const parentSignal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
  return new Promise<Response>((resolve, reject) => {
    const cleanup = () => {
      window.clearTimeout(timeoutId);
      parentSignal?.removeEventListener('abort', abortFromParent);
    };
    const abortFromParent = () => {
      controller.abort(parentSignal?.reason);
      cleanup();
      reject(parentSignal?.reason ?? new DOMException('Cloud request aborted', 'AbortError'));
    };
    const timeoutId = window.setTimeout(() => {
      const error = new DOMException('Cloud request timed out', 'AbortError');
      controller.abort(error);
      cleanup();
      reject(error);
    }, cloudRequestTimeoutMs);
    if (parentSignal?.aborted) {
      abortFromParent();
      return;
    }
    parentSignal?.addEventListener('abort', abortFromParent, { once: true });
    // Keep the abort timer after headers so a stalled response body is bounded too.
    globalThis.fetch(input, { ...init, signal: controller.signal }).then(resolve, (error: unknown) => {
      cleanup();
      reject(error);
    });
  });
}

export type CloudSnapshot = {
  payload: unknown;
  updatedAt: string;
  userId: string;
  revision?: number;
};

export type CloudSyncMeta = {
  lastCloudUpdatedAt: string;
  lastCloudRevision: number;
  lastSyncedAt: string;
  pending: boolean;
  conflict: boolean;
  error: string;
};

const emptyMeta: CloudSyncMeta = {
  lastCloudUpdatedAt: '',
  lastCloudRevision: 0,
  lastSyncedAt: '',
  pending: false,
  conflict: false,
  error: '',
};

export function isCloudSyncConfigured(): boolean {
  return Boolean(supabaseUrl && supabaseAnonKey);
}

export function isCloudAuthRequired(): boolean {
  return cloudAuthRequired;
}

export function isSignupConfigured(): boolean {
  return isCloudSyncConfigured() && signupEnabled;
}

export function getSupabaseClient(): SupabaseClient {
  if (!isCloudSyncConfigured()) {
    throw new Error('Supabase не настроен');
  }

  client ??= createClient(supabaseUrl!, supabaseAnonKey!, {
    global: { fetch: fetchCloudRequest },
    auth: {
      storageKey: cloudAuthStorageKey(),
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });

  return client;
}

export async function getCloudSession(): Promise<Session | null> {
  const { data, error } = await getSupabaseClient().auth.getSession();
  if (error) {
    throw error;
  }
  return data.session;
}

export async function getVerifiedCloudSession(): Promise<Session | null> {
  const session = await getCloudSession();
  if (!session) {
    return null;
  }

  const { error } = await getSupabaseClient().auth.getUser();
  if (error) {
    throw error;
  }

  return session;
}

async function verifyStartupSession(session: Session): Promise<void> {
  // SDK getUser can remove a newer session after a late session_not_found response.
  // This read only verifies the captured token and leaves SDK storage/events alone.
  let response: Response;
  try {
    response = await fetchCloudRequest(`${supabaseUrl!.replace(/\/$/, '')}/auth/v1/user`, {
      headers: { apikey: supabaseAnonKey!, Authorization: `Bearer ${session.access_token}` },
    });
    if (response.status >= 500) {
      throw new AuthRetryableFetchError('Auth service unavailable', response.status);
    }
    if (!response.ok) {
      throw new AuthApiError('Не удалось подтвердить вход', response.status, 'startup_auth_rejected');
    }
    const data = await response.json();
    if (data.id !== session.user.id) {
      throw new AuthApiError('Не удалось подтвердить владельца сессии', 401, 'user_mismatch');
    }
  } catch (error) {
    if (error instanceof AuthApiError || isAuthRetryableFetchError(error)) {
      throw error;
    }
    throw new AuthRetryableFetchError('Не удалось связаться с сервисом входа', 0);
  }
}

type StartupCloudSessionOptions = {
  onSessionLoaded?: (session: Session | null) => void;
  onAuthRejected?: (error: unknown, session: Session | null) => void;
};

export async function getStartupCloudSession(options: StartupCloudSessionOptions = {}): Promise<Session | null> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    const session = ownedActiveCachedSession();
    options.onSessionLoaded?.(session);
    return session;
  }

  let settled = false;
  let candidate: Session | null = null;
  return new Promise<Session | null>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      settled = true;
      const cached = ownedActiveCachedSession();
      if (cached) {
        options.onSessionLoaded?.(cached);
        resolve(cached);
      } else {
        reject(new Error('Не удалось проверить вход. Подключитесь к интернету и попробуйте снова.'));
      }
    }, startupRequestTimeoutMs);

    const request = (async () => {
      candidate = await getCloudSession();
      if (settled) {
        return null;
      }
      options.onSessionLoaded?.(candidate);
      if (!candidate) {
        return null;
      }
      await verifyStartupSession(candidate);
      return candidate;
    })();
    request.then(
      (session) => {
        if (settled) {
          return;
        }
        settled = true;
        window.clearTimeout(timeoutId);
        resolve(session);
      },
      (error: unknown) => {
        if (!isAuthRetryableFetchError(error)) {
          options.onAuthRejected?.(error, candidate);
        }
        if (settled) {
          return;
        }
        settled = true;
        window.clearTimeout(timeoutId);
        const cached = isAuthRetryableFetchError(error) ? ownedActiveCachedSession() : null;
        if (cached) {
          options.onSessionLoaded?.(cached);
          resolve(cached);
        } else {
          reject(error);
        }
      },
    );
  });
}

export function onCloudAuthChange(callback: (event: AuthChangeEvent, session: Session | null) => void) {
  return getSupabaseClient().auth.onAuthStateChange((event, session) => callback(event, session));
}

export async function signInToCloud(email: string, password: string): Promise<Session | null> {
  const { data, error } = await getSupabaseClient().auth.signInWithPassword({ email, password });
  if (error) {
    throw error;
  }
  return data.session;
}

export async function signUpToCloud(email: string, password: string): Promise<{ session: Session | null; confirmationRequired: boolean }> {
  const { data, error } = await getSupabaseClient().auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${window.location.origin}/access?mode=sign-in`,
    },
  });
  if (error) {
    throw error;
  }
  return { session: data.session, confirmationRequired: !data.session };
}

export async function requestCloudPasswordReset(email: string): Promise<void> {
  const { error } = await getSupabaseClient().auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/password-reset`,
  });
  if (error) {
    throw error;
  }
}

export async function resendCloudSignupConfirmation(email: string): Promise<void> {
  const { error } = await getSupabaseClient().auth.resend({
    type: 'signup',
    email,
    options: {
      emailRedirectTo: `${window.location.origin}/access?mode=sign-in`,
    },
  });
  if (error) {
    throw error;
  }
}

export async function updateCloudPassword(password: string): Promise<void> {
  const { error } = await getSupabaseClient().auth.updateUser({ password });
  if (error) {
    throw error;
  }
}

export async function deleteCloudAccount(): Promise<void> {
  const { error } = await getSupabaseClient().functions.invoke('delete-account', {
    body: { confirmation: 'DELETE_MY_ACCOUNT' },
  });
  if (error) {
    throw error;
  }
}

export async function clearLocalCloudSession(): Promise<void> {
  const { error } = await getSupabaseClient().auth.signOut({ scope: 'local' });
  if (error) {
    throw error;
  }
}

export async function signOutFromCloud(): Promise<void> {
  const { error } = await getSupabaseClient().auth.signOut();
  if (error) {
    throw error;
  }
}

export async function loadCloudSnapshot(scope?: CloudOperationScope): Promise<CloudSnapshot | null> {
  const session = await requireSession(scope);
  const { data, error } = await getSupabaseClient()
    .from('trajectory_snapshots')
    .select('payload, updated_at, revision')
    .eq('user_id', session.user.id)
    .maybeSingle();

  scope?.assertCurrent();

  if (error) {
    throw error;
  }
  if (!data) {
    return null;
  }

  return {
    payload: data.payload,
    updatedAt: data.updated_at,
    userId: session.user.id,
    revision: Number(data.revision),
  };
}

export class CloudRevisionConflictError extends Error {
  constructor() {
    super('Облачные данные изменились на другом устройстве');
    this.name = 'CloudRevisionConflictError';
  }
}

export async function saveCloudSnapshot(payload: unknown, expectedRevision: number, scope?: CloudOperationScope): Promise<CloudSnapshot> {
  const session = await requireSession(scope);
  const updatedAt = new Date().toISOString();
  const nextRevision = expectedRevision + 1;
  const query =
    expectedRevision === 0
      ? getSupabaseClient()
          .from('trajectory_snapshots')
          .insert({ user_id: session.user.id, payload, revision: nextRevision, updated_at: updatedAt })
          .select('payload, updated_at, revision')
          .maybeSingle()
      : getSupabaseClient()
          .from('trajectory_snapshots')
          .update({ payload, revision: nextRevision, updated_at: updatedAt })
          .eq('user_id', session.user.id)
          .eq('revision', expectedRevision)
          .select('payload, updated_at, revision')
          .maybeSingle();
  const { data, error } = await query;

  scope?.assertCurrent();

  if (error?.code === '23505' || (!error && !data)) {
    throw new CloudRevisionConflictError();
  }
  if (error) {
    throw error;
  }
  if (!data) {
    throw new CloudRevisionConflictError();
  }
  const snapshot = {
    payload: data.payload,
    updatedAt: data.updated_at,
    revision: Number(data.revision),
    userId: session.user.id,
  };
  saveCloudSyncMeta(session.user.id, {
    lastCloudUpdatedAt: snapshot.updatedAt,
    lastCloudRevision: snapshot.revision,
    lastSyncedAt: new Date().toISOString(),
    pending: false,
    conflict: false,
    error: '',
  });
  return snapshot;
}

export function getCloudSyncMeta(userId: string): CloudSyncMeta {
  try {
    const value = window.localStorage.getItem(cloudSyncMetaKey(userId));
    return value ? { ...emptyMeta, ...JSON.parse(value) } : { ...emptyMeta };
  } catch {
    return { ...emptyMeta };
  }
}

export function saveCloudSyncMeta(userId: string, patch: Partial<CloudSyncMeta>, storage: Pick<Storage, 'setItem'> = window.localStorage) {
  const next = { ...getCloudSyncMeta(userId), ...patch };
  try {
    storage.setItem(cloudSyncMetaKey(userId), JSON.stringify(next));
  } catch {
    console.warn('Не удалось сохранить состояние облачной синхронизации');
  }
  return next;
}

export function markCloudSyncPending(userId: string, error: string) {
  return saveCloudSyncMeta(userId, {
    pending: true,
    error,
  });
}

export function markCloudSyncConflict(userId: string, cloudUpdatedAt: string, cloudRevision = 0) {
  return saveCloudSyncMeta(userId, {
    lastCloudUpdatedAt: cloudUpdatedAt,
    lastCloudRevision: cloudRevision,
    pending: false,
    conflict: true,
    error: '',
  });
}

export function markCloudSyncSynced(userId: string, cloudUpdatedAt: string, cloudRevision = 0) {
  return saveCloudSyncMeta(userId, {
    lastCloudUpdatedAt: cloudUpdatedAt,
    lastCloudRevision: cloudRevision,
    lastSyncedAt: new Date().toISOString(),
    pending: false,
    conflict: false,
    error: '',
  });
}

export function subscribeToCloudSnapshot(userId: string, onChange: () => void) {
  const supabase = getSupabaseClient();
  const channel = supabase
    .channel(`trajectory-snapshot:${userId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'trajectory_snapshots', filter: `user_id=eq.${userId}` }, () =>
      onChange(),
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}

export function clearCloudSyncMeta(userId: string) {
  window.localStorage.removeItem(cloudSyncMetaKey(userId));
}

function cloudSyncMetaKey(userId: string) {
  return `trajectory:cloud-sync:${userId}`;
}

async function requireSession(scope?: CloudOperationScope): Promise<Session> {
  scope?.assertCurrent();
  const session = await getVerifiedCloudSession();
  scope?.assertCurrent();
  if (!session) {
    throw new Error('Сначала войди в облачную копию');
  }
  if (scope && session.user.id !== scope.userId) {
    throw new CloudOperationCancelledError();
  }
  return session;
}
