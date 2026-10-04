// @vitest-environment happy-dom

import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import PeriodNavigator from '../PeriodNavigator.vue';

describe('PeriodNavigator', () => {
  it('exposes previous, current and next actions with accessible labels', async () => {
    const wrapper = mount(PeriodNavigator, {
      props: { title: 'Июль 2026', subtitle: '20 записей' },
    });

    expect(wrapper.text()).toContain('Июль 2026');
    expect(wrapper.text()).toContain('20 записей');
    expect(wrapper.findAll('.icon-button svg[aria-hidden="true"]')).toHaveLength(2);

    await wrapper.get('[aria-label="Предыдущий период"]').trigger('click');
    await wrapper.get('.period-nav__label').trigger('click');
    await wrapper.get('[aria-label="Следующий период"]').trigger('click');

    expect(wrapper.emitted('previous')).toHaveLength(1);
    expect(wrapper.emitted('current')).toHaveLength(1);
    expect(wrapper.emitted('next')).toHaveLength(1);
  });
});
