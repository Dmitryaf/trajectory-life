import { productTelemetry } from '@/features/telemetry/productTelemetry';
import { defineStore } from 'pinia';
import type { Session } from '@supabase/supabase-js';
import {
  clearCloudSyncMeta,
  clearLocalCloudSession,
  deleteCloudAccount,
  getCachedCloudSession,
  invalidateCachedCloudSession,
  getStartupCloudSession,
  isSignupConfigured,
  isCloudAuthRequired,
  isCloudSyncConfigured,
  onCloudAuthChange,
  resendCloudSignupConfirmation,
  requestCloudPasswordReset,
  signInToCloud,
  signOutFromCloud,
  signUpToCloud,
  updateCloudPassword,
} from '../services/cloudSync';

let unsubscribeAuth: (() => void) | null = null;
const passwordRecoveryKey = 'trajectory:password-recovery-required';
const authRequestTimeoutMs = 20_000;

export type AuthOperation =
  | 'initializing'
  | 'signing-in'
  | 'signing-up'
  | 'requesting-password-reset'
  | 'resending-confirmation'
  | 'updating-password'
  | 'completing-password-recovery'
  | 'canceling-password-recovery'
  | 'deleting-account'
  | 'signing-out';

type AuthErrorDetails = { code: string; message: string; status: number | null };

function withAuthRequestTimeout<T>(request: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      reject(Object.assign(new Error('Registration request timed out'), { code: 'request_timeout' }));
    }, authRequestTimeoutMs);

    request.then(
      (value) => {
        window.clearTimeout(timeoutId);
        resolve(value);
      },
      (error: unknown) => {
        window.clearTimeout(timeoutId);
        reject(error);
      },
    );
  });
}

function authErrorDetails(error: unknown): AuthErrorDetails {
  if (!error || typeof error !== 'object') {
    return { code: '', message: '', status: null };
  }
  const source = error as { code?: unknown; message?: unknown; status?: unknown };
  return {
    code: typeof source.code === 'string' ? source.code.toLocaleLowerCase() : '',
    message: typeof source.message === 'string' ? source.message.toLocaleLowerCase() : '',
    status: typeof source.status === 'number' ? source.status : null,
  };
}

function signupErrorMessage(error: unknown): string {
  const details = authErrorDetails(error);
  if (details.code === 'request_timeout') {
    return 'Сервис долго не отвечает. Проверь интернет и почту: аккаунт мог быть создан. Затем попробуй войти или повтори позже.';
  }
  if (details.status === 429 || details.code.includes('rate_limit') || details.message.includes('rate limit')) {
    return 'Слишком много попыток. Подожди несколько минут и попробуй ещё раз.';
  }
  if (details.code === 'signup_disabled' || details.message.includes('регистрация временно закрыта')) {
    return 'Регистрация временно закрыта. Попробуй позже.';
  }
  if (details.message.includes('набор участников завершён')) {
    return 'Набор участников завершён. Новый аккаунт сейчас создать нельзя.';
  }
  if (details.code.includes('email') || details.message.includes('email address') || details.message.includes('invalid email')) {
    return 'Не удалось использовать этот email. Проверь адрес и попробуй ещё раз.';
  }
  if (details.code.includes('weak_password') || details.message.includes('password')) {
    return 'Пароль не подходит. Используй не меньше 8 символов и попробуй ещё раз.';
  }
  if (details.message.includes('fetch') || details.message.includes('network') || details.message.includes('offline')) {
    return 'Нет связи с сервисом. Проверь интернет — введённые данные остались в форме.';
  }
  if (details.status !== null && details.status >= 500) {
    return 'Сервис регистрации временно недоступен. Попробуй ещё раз позже.';
  }
  return 'Не удалось создать аккаунт. Проверь введённые данные и попробуй ещё раз.';
}

function hasPasswordRecoveryRedirect() {
  const url = new URL(window.location.href);
  return (
    url.pathname === '/password-reset' ||
    url.searchParams.get('password-recovery') === '1' ||
    window.sessionStorage.getItem(passwordRecoveryKey) === '1'
  );
}

function persistPasswordRecovery(required: boolean) {
  if (required) {
    window.sessionStorage.setItem(passwordRecoveryKey, '1');
  } else {
    window.sessionStorage.removeItem(passwordRecoveryKey);
  }
}

export const useAuthStore = defineStore('auth', {
  state: () => ({
    configured: isCloudSyncConfigured(),
    authRequired: isCloudAuthRequired(),
    signupEnabled: isSignupConfigured(),
    initialized: false,
    sessionRevision: 0,
    operation: null as AuthOperation | null,
    session: null as Session | null,
    recoveryRequired: false,
    error: '',
    notice: '',
  }),
  getters: {
    loading: (state) => state.operation !== null,
    requiresAuth: (state) => state.configured || state.authRequired,
    configurationMissing: (state) => state.authRequired && !state.configured,
    isAuthenticated: (state) => (state.configured ? Boolean(state.session && !state.recoveryRequired) : !state.authRequired),
    userEmail: (state) => state.session?.user.email ?? '',
  },
  actions: {
    async init() {
      if (this.initialized || this.loading) {
        return;
      }
      const revision = this.sessionRevision;
      this.operation = 'initializing';
      this.error = '';
      try {
        if (!this.configured) {
          this.initialized = true;
          return;
        }

        this.recoveryRequired = hasPasswordRecoveryRedirect();
        persistPasswordRecovery(this.recoveryRequired);
        const cachedToken = getCachedCloudSession()?.access_token;
        let rejectedToken: string | undefined;
        let sdkStartupPending = true;
        const startupTokens = new Set([cachedToken]);
        unsubscribeAuth?.();
        const listener = onCloudAuthChange((event, session) => {
          // SDK startup events describe storage, not a verified sign-in.
          if (event === 'INITIAL_SESSION') {
            sdkStartupPending = false;
            return;
          }
          if (
            sdkStartupPending &&
            this.sessionRevision === revision &&
            (event === 'SIGNED_IN' || (event === 'TOKEN_REFRESHED' && !this.initialized))
          ) {
            startupTokens.add(session?.access_token);
            return;
          }
          if (session?.access_token && session.access_token === rejectedToken) {
            return;
          }
          if (event === 'SIGNED_IN' && startupTokens.has(session?.access_token)) {
            return;
          }
          this.sessionRevision += 1;
          this.session = session;
          if (event === 'PASSWORD_RECOVERY') {
            this.recoveryRequired = true;
            persistPasswordRecovery(true);
          }
        });
        unsubscribeAuth = () => listener.data.subscription.unsubscribe();
        const session = await getStartupCloudSession({
          onAuthRejected: (error, candidate) => {
            if (this.sessionRevision !== revision) {
              return;
            }
            rejectedToken = candidate?.access_token ?? cachedToken;
            invalidateCachedCloudSession(candidate);
            if (!this.initialized || this.session?.access_token !== candidate?.access_token) {
              return;
            }
            this.sessionRevision += 1;
            this.session = null;
            this.error = error instanceof Error ? error.message : 'Не удалось проверить вход';
          },
        });
        if (this.sessionRevision === revision) {
          this.session = session;
        }
        this.initialized = true;
      } catch (error) {
        if (this.sessionRevision === revision) {
          this.session = null;
          this.error = error instanceof Error ? error.message : 'Не удалось проверить вход';
        }
        this.initialized = true;
      } finally {
        if (this.operation === 'initializing') {
          this.operation = null;
        }
      }
    },
    async signIn(email: string, password: string) {
      this.sessionRevision += 1;
      this.operation = 'signing-in';
      this.error = '';
      this.notice = '';
      try {
        this.session = await signInToCloud(email, password);
      } catch (error) {
        this.error = 'Не удалось войти. Проверь email и пароль.';
        throw error;
      } finally {
        this.operation = null;
      }
    },
    async signUp(email: string, password: string) {
      this.sessionRevision += 1;
      this.operation = 'signing-up';
      this.error = '';
      try {
        const result = await withAuthRequestTimeout(signUpToCloud(email, password));
        this.session = result.session;
        return result;
      } catch (error) {
        this.error = signupErrorMessage(error);
        throw error;
      } finally {
        this.operation = null;
      }
    },
    async requestPasswordReset(email: string) {
      this.operation = 'requesting-password-reset';
      this.error = '';
      try {
        await requestCloudPasswordReset(email);
      } catch (error) {
        this.error = 'Не удалось отправить письмо. Попробуй ещё раз позже.';
        throw error;
      } finally {
        this.operation = null;
      }
    },
    async resendSignupConfirmation(email: string) {
      this.operation = 'resending-confirmation';
      this.error = '';
      try {
        await resendCloudSignupConfirmation(email);
      } catch (error) {
        this.error = 'Не удалось отправить письмо повторно. Попробуй ещё раз позже.';
        throw error;
      } finally {
        this.operation = null;
      }
    },
    async updatePassword(password: string) {
      this.operation = 'updating-password';
      this.error = '';
      try {
        await updateCloudPassword(password);
      } catch (error) {
        this.error = 'Не удалось изменить пароль. Попробуй ещё раз.';
        throw error;
      } finally {
        this.operation = null;
      }
    },
    async completePasswordRecovery(password: string) {
      this.sessionRevision += 1;
      if (!this.recoveryRequired || !this.session) {
        throw new Error('Ссылка восстановления недействительна');
      }
      this.operation = 'completing-password-recovery';
      this.error = '';
      let passwordUpdated = false;
      try {
        await updateCloudPassword(password);
        passwordUpdated = true;
        await signOutFromCloud();
        this.session = null;
        this.recoveryRequired = false;
        persistPasswordRecovery(false);
        this.notice = 'Пароль изменён. Войдите с новым паролем.';
      } catch (error) {
        this.error = passwordUpdated
          ? 'Пароль изменён, но выйти из аккаунта не удалось. Вернитесь ко входу и используйте новый пароль.'
          : 'Не удалось изменить пароль. Запросите новую ссылку и попробуйте ещё раз.';
        throw error;
      } finally {
        this.operation = null;
      }
    },
    async cancelPasswordRecovery() {
      this.sessionRevision += 1;
      this.operation = 'canceling-password-recovery';
      this.error = '';
      try {
        if (this.session) {
          await signOutFromCloud();
        }
        this.session = null;
        this.recoveryRequired = false;
        persistPasswordRecovery(false);
      } catch (error) {
        this.error = 'Не удалось выйти из аккаунта. Проверьте подключение и попробуйте ещё раз.';
        throw error;
      } finally {
        this.operation = null;
      }
    },
    async deleteAccount() {
      this.sessionRevision += 1;
      const userId = this.session?.user.id;
      if (!userId) {
        throw new Error('Сессия не найдена');
      }

      this.operation = 'deleting-account';
      this.error = '';
      try {
        await deleteCloudAccount();
      } catch (error) {
        this.error = 'Не удалось удалить аккаунт. Данные не были очищены на этом устройстве.';
        throw error;
      }

      productTelemetry.clearDeletedAccount(userId);
      clearCloudSyncMeta(userId);
      try {
        await clearLocalCloudSession();
      } catch {
        this.error = 'Аккаунт удалён. Локальный выход завершится после обновления страницы.';
      } finally {
        this.session = null;
        this.operation = null;
      }
    },
    async signOut() {
      this.sessionRevision += 1;
      this.operation = 'signing-out';
      this.error = '';
      try {
        await signOutFromCloud();
        this.session = null;
        this.recoveryRequired = false;
        persistPasswordRecovery(false);
      } finally {
        this.operation = null;
      }
    },
  },
});
