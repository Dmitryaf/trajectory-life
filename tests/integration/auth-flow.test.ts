// @vitest-environment happy-dom

import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import { describe, expect, it, vi } from 'vitest';
import AuthGate from '@/features/auth/ui/AuthGate.vue';
import { useAuthStore } from '@/stores/auth';
import PasswordResetView from '@/views/PasswordResetView.vue';

function authRouter() {
  return createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div>Policy</div>' } }] });
}

describe('authentication', () => {
  it('shows a focused authentication card without the former product presentation', () => {
    window.localStorage.clear();
    const pinia = createPinia();
    setActivePinia(pinia);
    const auth = useAuthStore();
    auth.signupEnabled = true;
    const wrapper = mount(AuthGate, { global: { plugins: [pinia, authRouter()] } });

    expect(wrapper.find('.auth-card').exists()).toBe(true);
    expect(wrapper.find('.auth-presentation').exists()).toBe(false);
    expect(wrapper.find('.auth-preview').exists()).toBe(false);
    expect(wrapper.get('.auth-card__brand h2').text()).toBe('Войдите в «Траекторию»');
  });

  it('switches between the requested registration form and sign-in', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const auth = useAuthStore();
    auth.signupEnabled = true;
    const wrapper = mount(AuthGate, {
      props: { initialMode: 'sign-up' },
      attachTo: document.body,
      global: { plugins: [pinia, authRouter()] },
    });

    expect(wrapper.text()).toContain('Создайте аккаунт');
    expect(wrapper.text()).toContain('Будет создан аккаунт для облачной синхронизации записей');
    expect(wrapper.text()).toContain('После регистрации нужно подтвердить email');
    expect(wrapper.findAll('input')).toHaveLength(3);
    expect(wrapper.findAll('button[aria-label="Показать пароль"]')).toHaveLength(2);
    expect(wrapper.get('#auth-password').attributes('autocomplete')).toBe('new-password');
    expect(wrapper.get('#auth-password-confirmation').attributes('autocomplete')).toBe('new-password');

    await wrapper
      .get('.auth-mode')
      .findAll('button')
      .find((button) => button.text() === 'Войти')!
      .trigger('click');
    expect(wrapper.findAll('button[aria-label="Показать пароль"]')).toHaveLength(1);
    expect(wrapper.get('#auth-password').attributes('autocomplete')).toBe('current-password');
    wrapper.unmount();
  });

  it('uses the registration mode requested by the public access route when registration is enabled', () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const auth = useAuthStore();
    auth.signupEnabled = true;
    const wrapper = mount(AuthGate, { props: { initialMode: 'sign-up' }, global: { plugins: [pinia, authRouter()] } });

    expect(wrapper.get('.auth-card__brand h2').text()).toBe('Создайте аккаунт');
    expect(wrapper.findAll('.auth-form input')).toHaveLength(3);
  });

  it('registers with matching passwords and no invitation code', async () => {
    window.localStorage.clear();
    const pinia = createPinia();
    setActivePinia(pinia);
    const auth = useAuthStore();
    auth.signupEnabled = true;
    auth.signUp = vi.fn().mockResolvedValue({ session: null, confirmationRequired: true });
    const wrapper = mount(AuthGate, { props: { initialMode: 'sign-up' }, global: { plugins: [pinia, authRouter()] } });
    expect(wrapper.text()).toContain('Не меньше 8 символов.');
    expect(wrapper.get('button.primary-button').attributes('disabled')).toBeUndefined();
    const inputs = wrapper.findAll('input');
    await inputs[0].setValue('friend@example.com');
    await inputs[1].setValue('safe-password');
    await inputs[2].setValue('safe-password');
    await wrapper.get('form').trigger('submit');

    expect(auth.signUp).toHaveBeenCalledWith('friend@example.com', 'safe-password');
    expect(wrapper.find('form').exists()).toBe(false);
    expect(wrapper.text()).toContain('Аккаунт создан');
    expect(wrapper.text()).toContain('friend@example.com');
    expect(wrapper.text()).toContain('Подтверди email по ссылке');
    expect(wrapper.text()).toContain('Отправить письмо ещё раз');
    expect(wrapper.text()).toContain('Изменить email');
    expect(wrapper.text()).toContain('Перейти ко входу');
  });

  it('resends confirmation and lets the user correct the email', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const auth = useAuthStore();
    auth.signupEnabled = true;
    auth.signUp = vi.fn().mockResolvedValue({ session: null, confirmationRequired: true });
    auth.resendSignupConfirmation = vi.fn().mockResolvedValue(undefined);
    const wrapper = mount(AuthGate, {
      props: { initialMode: 'sign-up' },
      attachTo: document.body,
      global: { plugins: [pinia, authRouter()] },
    });
    const inputs = wrapper.findAll('input');
    await inputs[0].setValue('friend@example.com');
    await inputs[1].setValue('safe-password');
    await inputs[2].setValue('safe-password');
    await wrapper.get('form').trigger('submit');
    await flushPromises();

    await wrapper
      .findAll('button')
      .find(
        (button) =>
          button.find('[aria-hidden="false"]').exists() && button.find('[aria-hidden="false"]').text() === 'Отправить письмо ещё раз',
      )!
      .trigger('click');
    expect(auth.resendSignupConfirmation).toHaveBeenCalledWith('friend@example.com');
    expect(wrapper.text()).toContain('Письмо отправлено повторно');

    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Изменить email')!
      .trigger('click');
    expect((wrapper.get('input[type="email"]').element as HTMLInputElement).value).toBe('friend@example.com');
    expect(wrapper.get('input[type="email"]').element).toBe(document.activeElement);
    wrapper.unmount();
  });

  it('shows the exact registration operation while signup is pending', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const auth = useAuthStore();
    auth.signupEnabled = true;
    auth.signUp = vi.fn().mockImplementation(async () => {
      auth.operation = 'signing-up';
      await new Promise(() => undefined);
    });
    const wrapper = mount(AuthGate, { props: { initialMode: 'sign-up' }, global: { plugins: [pinia, authRouter()] } });
    const inputs = wrapper.findAll('input');
    await inputs[0].setValue('friend@example.com');
    await inputs[1].setValue('safe-password');
    await inputs[2].setValue('safe-password');
    await wrapper.get('form').trigger('submit');

    expect(wrapper.get('form').attributes('aria-busy')).toBe('true');
    expect(wrapper.get('button[type="submit"]').attributes('disabled')).toBeDefined();
    expect(wrapper.get('button[type="submit"]').text()).toContain('Создаём аккаунт…');
    expect(wrapper.find('.auth-button-spinner').exists()).toBe(true);
  });

  it('keeps the email but clears passwords after a recoverable registration error', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const auth = useAuthStore();
    auth.signupEnabled = true;
    auth.signUp = vi.fn().mockImplementation(async () => {
      auth.error = 'Слишком много попыток. Подожди несколько минут и попробуй ещё раз.';
      throw new Error('Слишком много попыток');
    });
    const wrapper = mount(AuthGate, { props: { initialMode: 'sign-up' }, global: { plugins: [pinia, authRouter()] } });
    const inputs = wrapper.findAll('input');
    await inputs[0].setValue('friend@example.com');
    await inputs[1].setValue('safe-password');
    await inputs[2].setValue('safe-password');
    await wrapper.get('form').trigger('submit');
    await flushPromises();

    expect((wrapper.get('input[type="email"]').element as HTMLInputElement).value).toBe('friend@example.com');
    expect((wrapper.get('#auth-password').element as HTMLInputElement).value).toBe('');
    expect((wrapper.get('#auth-password-confirmation').element as HTMLInputElement).value).toBe('');
    expect(wrapper.get('[role="alert"]').text()).toContain('Слишком много попыток');
  });

  it('uses a dedicated password reset page before returning to sign-in', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const auth = useAuthStore();
    auth.recoveryRequired = true;
    auth.session = { user: { id: 'user-1', email: 'friend@example.com' } } as typeof auth.session;
    auth.completePasswordRecovery = vi.fn().mockResolvedValue(undefined);
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/access', component: { template: '<div>Вход</div>' } },
        { path: '/password-reset', component: PasswordResetView },
      ],
    });
    await router.push('/password-reset');
    await router.isReady();
    const wrapper = mount(PasswordResetView, { global: { plugins: [pinia, router] } });

    expect(wrapper.text()).toContain('Новый пароль');
    expect(wrapper.text()).toContain('Не меньше 8 символов.');
    const inputs = wrapper.findAll('input');
    await inputs[0].setValue('new-safe-password');
    await inputs[1].setValue('new-safe-password');
    const visibilityButtons = wrapper.findAll('button[aria-label="Показать пароль"]');
    expect(visibilityButtons).toHaveLength(2);
    await visibilityButtons[0]!.trigger('click');
    expect(inputs[0]!.attributes('type')).toBe('text');
    expect(inputs[0]!.element.value).toBe('new-safe-password');
    await wrapper.get('form').trigger('submit');
    await flushPromises();

    expect(auth.completePasswordRecovery).toHaveBeenCalledWith('new-safe-password');
    expect(router.currentRoute.value.fullPath).toBe('/access?mode=sign-in');
  });

  it('explains why an incomplete registration cannot be submitted', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const auth = useAuthStore();
    auth.signupEnabled = true;
    auth.signUp = vi.fn();
    const wrapper = mount(AuthGate, { props: { initialMode: 'sign-up' }, global: { plugins: [pinia, authRouter()] } });
    const inputs = wrapper.findAll('input');
    await inputs[0].setValue('friend@example.com');
    await inputs[1].setValue('short');
    await wrapper.get('form').trigger('submit');

    expect(wrapper.text()).toContain('Пароль должен содержать не меньше 8 символов.');
    expect(auth.signUp).not.toHaveBeenCalled();
  });
});
