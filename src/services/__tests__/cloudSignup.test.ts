// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { currentTermsAcceptance } from '@/model/legalDocuments';

const signUp = vi.hoisted(() => vi.fn());
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ auth: { signUp } }) }));

beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  vi.stubEnv('VITE_SUPABASE_URL', 'https://example.test');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'synthetic-public-key');
  vi.stubEnv('VITE_ENABLE_SIGNUP', 'true');
});
afterEach(() => vi.unstubAllEnvs());

describe('open signup', () => {
  it('sends email and password without invitation metadata and awaits email confirmation', async () => {
    signUp.mockResolvedValue({ data: { session: null }, error: null });
    const cloud = await import('../cloudSync');

    expect(cloud.isSignupConfigured()).toBe(true);
    await expect(cloud.signUpToCloud('friend@example.com', 'safe-password', currentTermsAcceptance())).resolves.toEqual({
      session: null,
      confirmationRequired: true,
    });
    expect(signUp).toHaveBeenCalledWith({
      email: 'friend@example.com',
      password: 'safe-password',
      options: { emailRedirectTo: `${window.location.origin}/access?mode=sign-in`, data: { terms_acceptance: currentTermsAcceptance() } },
    });
  });

  it.each(['flag', 'backend'])('does not advertise signup without the %s configuration', async (missing) => {
    vi.stubEnv(missing === 'flag' ? 'VITE_ENABLE_SIGNUP' : 'VITE_SUPABASE_URL', '');
    const cloud = await import('../cloudSync');
    expect(cloud.isSignupConfigured()).toBe(false);
  });

  it('propagates server refusal without creating a session', async () => {
    const error = { status: 429, code: 'over_email_send_rate_limit' };
    signUp.mockResolvedValue({ data: { session: null }, error });
    const cloud = await import('../cloudSync');
    await expect(cloud.signUpToCloud('friend@example.com', 'safe-password', currentTermsAcceptance())).rejects.toBe(error);
  });
  it.each([undefined, { ...currentTermsAcceptance(), accepted: false }, { ...currentTermsAcceptance(), terms_version: 'old' }])(
    'does not submit registration without current acceptance %j',
    async (acceptance) => {
      const cloud = await import('../cloudSync');
      await expect(
        cloud.signUpToCloud('friend@example.test', 'safe-password', acceptance as ReturnType<typeof currentTermsAcceptance>),
      ).rejects.toThrow('актуальные Условия');
      expect(signUp).not.toHaveBeenCalled();
    },
  );
});
