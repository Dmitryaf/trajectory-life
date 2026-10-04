// @vitest-environment happy-dom

import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import ChipGroup from '../ChipGroup.vue';

describe('ChipGroup', () => {
  it('adds and removes values in a multiple choice group', async () => {
    const wrapper = mount(ChipGroup, {
      props: {
        options: [
          { id: 'reading', label: 'Чтение' },
          { id: 'walk', label: 'Прогулка' },
        ],
        modelValue: ['reading'],
        multiple: true,
      },
    });
    const buttons = wrapper.findAll('button');

    expect(buttons[0].attributes('aria-pressed')).toBe('true');
    expect(buttons[1].attributes('aria-pressed')).toBe('false');

    await buttons[1].trigger('click');
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([['reading', 'walk']]);

    await wrapper.setProps({ modelValue: ['reading', 'walk'] });
    await buttons[0].trigger('click');
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([['walk']]);
  });
});
