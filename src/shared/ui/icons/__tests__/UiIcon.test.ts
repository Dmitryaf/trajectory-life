// @vitest-environment happy-dom

import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import UiIcon from '../UiIcon.vue';
import type { UiIconName } from '../icons';

describe('UiIcon', () => {
  it.each<UiIconName>(['today', 'week', 'month', 'history', 'journal', 'settings', 'edit', 'delete'])(
    'renders %s as a decorative local SVG',
    (name) => {
      const wrapper = mount(UiIcon, { props: { name } });

      expect(wrapper.element.tagName).toBe('svg');
      expect(wrapper.attributes('aria-hidden')).toBe('true');
      expect(wrapper.attributes('focusable')).toBe('false');
      expect(wrapper.get('use').attributes('href')).toBe(`/icons/ui-icons.svg#${name}`);
      expect(wrapper.text()).toBe('');
    },
  );
});
