import type { Router } from 'vue-router';

type SessionStorage = Pick<Storage, 'getItem'>;
type SessionLoader = () => Promise<unknown>;

type StoredSessionProbe = {
  storage?: SessionStorage;
  supabaseUrl?: string;
  loadSession?: SessionLoader;
};

const configuredSupabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;

export function cloudSessionStorageKey(supabaseUrl = configuredSupabaseUrl): string {
  if (!supabaseUrl) {
    return '';
  }
  try {
    const projectRef = new URL(supabaseUrl).hostname.split('.')[0];
    return projectRef ? `sb-${projectRef}-auth-token` : '';
  } catch {
    return '';
  }
}

export async function hasAuthenticatedStoredSession({
  storage = window.localStorage,
  supabaseUrl = configuredSupabaseUrl,
  loadSession = async () => (await import('@/services/cloudSync')).getStartupCloudSession(),
}: StoredSessionProbe = {}): Promise<boolean> {
  const storageKey = cloudSessionStorageKey(supabaseUrl);
  if (!storageKey) {
    return false;
  }
  try {
    if (!storage.getItem(storageKey)) {
      return false;
    }
    return Boolean(await loadSession());
  } catch {
    return false;
  }
}

export function installAuthenticatedLandingRedirect(
  router: Router,
  hasAuthenticatedSession: () => Promise<boolean> = hasAuthenticatedStoredSession,
): void {
  router.beforeEach(async (to) => {
    if (to.path === '/' && to.hash === '#data-policy') {
      return { path: '/data-policy', replace: true };
    }
    if (to.path !== '/' || !(await hasAuthenticatedSession())) {
      return true;
    }
    return { path: '/today', replace: true };
  });
}
