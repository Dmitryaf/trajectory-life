import { createClient, isAuthRetryableFetchError, type AuthChangeEvent, type Session, type SupabaseClient } from '@supabase/supabase-js';
import { CloudOperationCancelledError, type CloudOperationScope } from './cloudOperation';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const signupEnabled = import.meta.env.VITE_ENABLE_SIGNUP === 'true';
const cloudAuthRequired = import.meta.env.VITE_REQUIRE_AUTH === 'true';

let client: SupabaseClient | null = null;

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
    auth: {
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

export async function getStartupCloudSession(): Promise<Session | null> {
  const session = await getCloudSession();
  if (!session) {
    return null;
  }

  const { error } = await getSupabaseClient().auth.getUser();
  if (!error || isAuthRetryableFetchError(error)) {
    return session;
  }

  throw error;
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
