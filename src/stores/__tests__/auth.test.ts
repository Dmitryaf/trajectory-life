// @vitest-environment happy-dom

import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const cloud = vi.hoisted(() => ({
  authRequired: vi.fn(),
  clearLocalSession: vi.fn(),
  configured: vi.fn(),
  deleteAccount: vi.fn(),
  getStartupSession: vi.fn(),
  onAuthChange: vi.fn(),
  requestPasswordReset: vi.fn(),
  resendConfirmation: vi.fn(),
  signUp: vi.fn(),
  signOut: vi.fn(),
  updatePassword: vi.fn(),
}));

vi.mock('@/services/cloudSync', () => ({
  clearCloudSyncMeta: vi.fn(),
  clearLocalCloudSession: cloud.clearLocalSession,
  deleteCloudAccount: cloud.deleteAccount,
  getStartupCloudSession: cloud.getStartupSession,
  getCachedCloudSession: vi.fn(() => null),
  invalidateCachedCloudSession: vi.fn(),
  isSignupConfigured: vi.fn(() => true),
  isCloudAuthRequired: cloud.authRequired,
  isCloudSyncConfigured: cloud.configured,
  onCloudAuthChange: cloud.onAuthChange,
  resendCloudSignupConfirmation: cloud.resendConfirmation,
  requestCloudPasswordReset: cloud.requestPasswordReset,
  signInToCloud: vi.fn(),
  signOutFromCloud: cloud.signOut,
  signUpToCloud: cloud.signUp,
  updateCloudPassword: cloud.updatePassword,
}));

import { useAuthStore } from '../auth';

describe('auth store lifecycle', () => {
  it('distinguishes a failed password update from a failed sign-out and retains the recovery gate', async () => {
    const auth = useAuthStore();
    auth.recoveryRequired = true;
    auth.session = { user: { id: 'user-1', email: 'friend@example.com' } } as typeof auth.session;
    cloud.updatePassword.mockRejectedValueOnce(new Error('update failed'));
    await expect(auth.completePasswordRecovery('new-password')).rejects.toThrow('update failed');
    expect(auth.error).toContain('Не удалось изменить пароль');
    expect(cloud.signOut).not.toHaveBeenCalled();

    cloud.updatePassword.mockResolvedValueOnce(undefined);
    cloud.signOut.mockRejectedValueOnce(new Error('sign-out failed'));
    await expect(auth.completePasswordRecovery('new-password')).rejects.toThrow('sign-out failed');
    expect(auth.error).toContain('Пароль изменён, но выйти из аккаунта не удалось');
    expect(auth.recoveryRequired).toBe(true);
    expect(auth.session).not.toBeNull();

    cloud.signOut.mockResolvedValueOnce(undefined);
    await auth.cancelPasswordRecovery();
    expect(auth.recoveryRequired).toBe(false);
    expect(auth.session).toBeNull();
  });

  it('keeps recovery access restricted when canceling recovery cannot sign out', async () => {
    const auth = useAuthStore();
    auth.recoveryRequired = true;
    auth.session = { user: { id: 'user-1' } } as typeof auth.session;
    cloud.signOut.mockRejectedValueOnce(new Error('offline'));
    await expect(auth.cancelPasswordRecovery()).rejects.toThrow('offline');
    expect(auth.error).toContain('Не удалось выйти');
    expect(auth.recoveryRequired).toBe(true);
    expect(auth.session).not.toBeNull();
    expect(auth.operation).toBeNull();
  });

  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    window.history.replaceState({}, '', '/');
    window.sessionStorage.clear();
    cloud.authRequired.mockReturnValue(false);
    cloud.configured.mockReturnValue(true);
    cloud.getStartupSession.mockResolvedValue(null);
    cloud.onAuthChange.mockImplementation(() => ({ data: { subscription: { unsubscribe: vi.fn() } } }));
  });

  it('keeps the user signed out until a new email is confirmed', async () => {
    cloud.signUp.mockResolvedValue({ session: null, confirmationRequired: true });
    const auth = useAuthStore();

    await expect(auth.signUp('friend@example.com', 'safe-password', currentTermsAcceptance())).resolves.toEqual({
      session: null,
      confirmationRequired: true,
    });
    expect(auth.session).toBeNull();
    expect(cloud.signUp).toHaveBeenCalledWith('friend@example.com', 'safe-password', currentTermsAcceptance());
  });

  it('exposes the current registration operation and clears it after completion', async () => {
    let finishSignup: ((value: { session: null; confirmationRequired: true }) => void) | undefined;
    cloud.signUp.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishSignup = resolve;
        }),
    );
    const auth = useAuthStore();

    const signup = auth.signUp('friend@example.com', 'safe-password', currentTermsAcceptance());
    expect(auth.operation).toBe('signing-up');
    expect(auth.loading).toBe(true);

    finishSignup?.({ session: null, confirmationRequired: true });
    await signup;
    expect(auth.operation).toBeNull();
    expect(auth.loading).toBe(false);
  });

  it('releases a registration button when the service never answers', async () => {
    vi.useFakeTimers();
    cloud.signUp.mockReturnValue(new Promise(() => undefined));
    const auth = useAuthStore();

    const signup = auth.signUp('friend@example.com', 'safe-password', currentTermsAcceptance());
    const rejection = expect(signup).rejects.toMatchObject({ code: 'request_timeout' });
    await vi.advanceTimersByTimeAsync(20_000);

    await rejection;
    expect(auth.operation).toBeNull();
    expect(auth.loading).toBe(false);
    expect(auth.error).toContain('Сервис долго не отвечает');
    vi.useRealTimers();
  });

  it.each([
    [{ status: 429, message: 'rate limit exceeded' }, 'Слишком много попыток. Подожди несколько минут и попробуй ещё раз.'],
    [{ code: 'signup_disabled' }, 'Регистрация временно закрыта. Попробуй позже.'],
    [{ message: 'Регистрация временно закрыта' }, 'Регистрация временно закрыта. Попробуй позже.'],
    [{ message: 'Набор участников завершён' }, 'Набор участников завершён. Новый аккаунт сейчас создать нельзя.'],
    [{ code: 'email_address_invalid' }, 'Не удалось использовать этот email. Проверь адрес и попробуй ещё раз.'],
    [{ code: 'weak_password' }, 'Пароль не подходит. Используй не меньше 8 символов и попробуй ещё раз.'],
    [{ message: 'Failed to fetch' }, 'Нет связи с сервисом. Проверь интернет — введённые данные остались в форме.'],
    [{ status: 503 }, 'Сервис регистрации временно недоступен. Попробуй ещё раз позже.'],
  ])('turns a signup failure into an actionable message', async (error, message) => {
    cloud.signUp.mockRejectedValue(error);
    const auth = useAuthStore();

    await expect(auth.signUp('friend@example.com', 'safe-password', currentTermsAcceptance())).rejects.toBe(error);
    expect(auth.error).toBe(message);
    expect(auth.operation).toBeNull();
  });

  it('fails closed when a deployed preview requires auth but has no backend configuration', async () => {
    cloud.authRequired.mockReturnValue(true);
    cloud.configured.mockReturnValue(false);
    const auth = useAuthStore();

    await auth.init();

    expect(auth.configurationMissing).toBe(true);
    expect(auth.requiresAuth).toBe(true);
    expect(auth.isAuthenticated).toBe(false);
  });

  it('keeps a cached session when startup verification is temporarily unavailable', async () => {
    const cachedSession = { user: { id: 'user-1', email: 'friend@example.com' } } as ReturnType<typeof useAuthStore>['session'];
    cloud.getStartupSession.mockResolvedValue(cachedSession);
    const auth = useAuthStore();

    await auth.init();

    expect(auth.session).toEqual(cachedSession);
    expect(auth.isAuthenticated).toBe(true);
    expect(auth.error).toBe('');
  });

  it('requests a password recovery email without exposing account existence', async () => {
    cloud.requestPasswordReset.mockResolvedValue(undefined);
    const auth = useAuthStore();

    await auth.requestPasswordReset('friend@example.com');
    expect(cloud.requestPasswordReset).toHaveBeenCalledWith('friend@example.com');
    expect(auth.error).toBe('');
  });

  it('resends the signup confirmation for the pending email', async () => {
    cloud.resendConfirmation.mockResolvedValue(undefined);
    const auth = useAuthStore();

    await auth.resendSignupConfirmation('friend@example.com');
    expect(cloud.resendConfirmation).toHaveBeenCalledWith('friend@example.com');
  });

  it('updates the password only through the authenticated cloud session', async () => {
    cloud.updatePassword.mockResolvedValue(undefined);
    const auth = useAuthStore();

    await auth.updatePassword('new-safe-password');
    expect(cloud.updatePassword).toHaveBeenCalledWith('new-safe-password');
  });

  it('blocks a recovery session until the password changes and a normal sign-in starts', async () => {
    let authListener: ((event: string, session: unknown) => void) | undefined;
    cloud.onAuthChange.mockImplementation((callback) => {
      authListener = callback;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    });
    cloud.updatePassword.mockResolvedValue(undefined);
    cloud.signOut.mockResolvedValue(undefined);
    const auth = useAuthStore();

    await auth.init();
    authListener?.('PASSWORD_RECOVERY', { user: { id: 'user-1', email: 'friend@example.com' } });

    expect(auth.recoveryRequired).toBe(true);
    expect(auth.isAuthenticated).toBe(false);

    await auth.completePasswordRecovery('new-safe-password');

    expect(cloud.updatePassword).toHaveBeenCalledWith('new-safe-password');
    expect(cloud.signOut).toHaveBeenCalledOnce();
    expect(auth.session).toBeNull();
    expect(auth.recoveryRequired).toBe(false);
    expect(auth.notice).toBe('Пароль изменён. Войдите с новым паролем.');
  });

  it('deletes only the current account and clears its local cloud session', async () => {
    cloud.deleteAccount.mockResolvedValue(undefined);
    cloud.clearLocalSession.mockResolvedValue(undefined);
    const auth = useAuthStore();
    auth.session = { user: { id: 'user-1' } } as typeof auth.session;

    await auth.deleteAccount();

    expect(cloud.deleteAccount).toHaveBeenCalledOnce();
    expect(cloud.clearLocalSession).toHaveBeenCalledOnce();
    expect(auth.session).toBeNull();
  });
});
import { currentTermsAcceptance } from '@/model/legalDocuments';
