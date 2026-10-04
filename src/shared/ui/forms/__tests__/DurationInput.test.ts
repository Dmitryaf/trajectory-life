// @vitest-environment happy-dom

import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import DurationInput from '../DurationInput.vue';

describe('DurationInput', () => {
  it('shows a duration as hours and minutes and emits exact minute values', async () => {
    const wrapper = mount(DurationInput, {
      props: { id: 'sleep-duration', modelValue: 415, maxHours: 24 },
    });
    const [hours, minutes] = wrapper.findAll('input');

    expect(hours.element.value).toBe('6');
    expect(minutes.element.value).toBe('55');

    await hours.setValue('7');
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([475]);

    await minutes.setValue('30');
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([450]);

    await wrapper.setProps({ modelValue: 90 });
    expect(hours.element.value).toBe('1');
    expect(minutes.element.value).toBe('30');
  });
});
