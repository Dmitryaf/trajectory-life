// @vitest-environment happy-dom

import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import AccountMenu from '../ui/AccountMenu.vue';

describe('AccountMenu', () => {
  it('dismisses the popup with Escape, outside interaction and focus leaving the account', async () => {
    const wrapper = mount(AccountMenu, {
      attachTo: document.body,
      props: { email: 'friend@example.com' },
      global: { stubs: { RouterLink: { props: ['to'], template: '<a :href="to"><slot /></a>' } } },
    });
    const outside = document.createElement('button');
    document.body.append(outside);
    try {
      const details = wrapper.get('details').element as HTMLDetailsElement;
      const trigger = wrapper.get('summary');
      await trigger.trigger('click');
      const settings = wrapper.get('a');
      (settings.element as HTMLElement).focus();
      await settings.trigger('keydown', { key: 'Escape' });
      expect(details.open).toBe(false);
      expect(document.activeElement).toBe(trigger.element);

      await trigger.trigger('click');
      (settings.element as HTMLElement).focus();
      expect(details.open).toBe(true);
      outside.focus();
      expect(details.open).toBe(false);
      expect(document.activeElement).toBe(outside);

      await trigger.trigger('click');
      outside.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      expect(details.open).toBe(false);
      expect(wrapper.emitted('signOut')).toBeUndefined();

      await trigger.trigger('click');
      await trigger.trigger('focusout', { relatedTarget: null });
      expect(details.open).toBe(true);
      await wrapper.get('.account-menu__logout').trigger('click');
      expect(wrapper.emitted('signOut')).toHaveLength(1);
    } finally {
      wrapper.unmount();
      outside.remove();
    }
  });

  it('groups settings and sign out under the current account', async () => {
    Object.defineProperty(window.navigator, 'userAgent', { configurable: true, value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' });
    const wrapper = mount(AccountMenu, {
      props: { email: 'friend@example.com' },
      global: {
        stubs: {
          RouterLink: { props: ['to'], template: '<a :href="to"><slot /></a>' },
        },
      },
    });

    expect(wrapper.text()).toContain('friend@example.com');
    expect(wrapper.text()).toContain('Настройки');
    expect(wrapper.find('a[href="/settings#install-settings"]').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('Обновить данные');
    expect(wrapper.get('summary').attributes('aria-label')).toBe('Открыть меню аккаунта');
    expect(wrapper.get('.account-menu__chevron').element.tagName).toBe('svg');
    expect(wrapper.get('.account-menu__chevron path').attributes('d')).toBe('m4 6 4 4 4-4');
    expect(wrapper.findAll('.account-menu__action svg[aria-hidden="true"]')).toHaveLength(2);

    const details = wrapper.get('details');
    expect((details.element as HTMLDetailsElement).open).toBe(false);
    await wrapper.get('summary').trigger('click');
    expect((details.element as HTMLDetailsElement).open).toBe(true);

    await wrapper.get('.account-menu__logout').trigger('click');
    expect((details.element as HTMLDetailsElement).open).toBe(false);
    expect(wrapper.emitted('signOut')).toHaveLength(1);
  });
});
