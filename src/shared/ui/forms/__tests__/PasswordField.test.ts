// @vitest-environment happy-dom

import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import PasswordField from '../PasswordField.vue';

describe('PasswordField', () => {
  it('toggles password visibility without changing the entered value', async () => {
    const wrapper = mount(PasswordField, {
      props: {
        id: 'test-password',
        modelValue: 'safe-password',
        autocomplete: 'current-password',
      },
    });
    const input = wrapper.get('input');
    const toggle = wrapper.get('button');

    expect(input.attributes('type')).toBe('password');
    expect(input.attributes('autocomplete')).toBe('current-password');
    expect(input.element.value).toBe('safe-password');
    expect(toggle.attributes('aria-label')).toBe('Показать пароль');
    expect(toggle.attributes('aria-pressed')).toBe('false');
    expect(toggle.attributes('aria-controls')).toBe('test-password');
    expect(toggle.text()).toBe('');
    expect(toggle.get('svg').attributes('aria-hidden')).toBe('true');
    expect(wrapper.get('.password-field').element.children[1]).toBe(toggle.element);

    await toggle.trigger('click');

    expect(input.attributes('type')).toBe('text');
    expect(input.element.value).toBe('safe-password');
    expect(toggle.attributes('aria-label')).toBe('Скрыть пароль');
    expect(toggle.attributes('aria-pressed')).toBe('true');
  });
});
