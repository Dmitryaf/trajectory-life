// @vitest-environment happy-dom

import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import ReviewPeriodNavigation from '../ui/ReviewPeriodNavigation.vue';

const RouterLink = {
  props: ['to'],
  template: '<a :href="to"><slot /></a>',
};

describe('ReviewPeriodNavigation', () => {
  it.each([
    ['week', '/week'],
    ['month', '/month'],
  ] as const)('links both review periods and marks %s as current', (period, currentHref) => {
    const wrapper = mount(ReviewPeriodNavigation, {
      props: { period },
      global: { stubs: { RouterLink } },
    });
    const links = wrapper.findAll('a');

    expect(links.map((link) => link.attributes('href'))).toEqual(['/week', '/month']);
    expect(wrapper.get(`a[href="${currentHref}"]`).attributes('aria-current')).toBe('page');
    expect(wrapper.findAll('a[aria-current="page"]')).toHaveLength(1);
  });
});
