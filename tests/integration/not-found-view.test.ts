// @vitest-environment happy-dom

import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import { describe, expect, it } from 'vitest';
import NotFoundView from '@/views/NotFoundView.vue';

describe('unknown route', () => {
  it('explains the missing page and returns to Today', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/today', component: { template: '<div>Сегодня</div>' } },
        { path: '/:pathMatch(.*)*', component: NotFoundView },
      ],
    });
    await router.push('/missing-page');
    await router.isReady();
    const wrapper = mount({ template: '<RouterView />' }, { global: { plugins: [router] } });

    expect(wrapper.get('h1').text()).toBe('Такой страницы нет');
    expect(wrapper.get('.not-found-card').text()).toContain('адрес устарел');
    expect(wrapper.get('a').text()).toBe('Перейти к «Сегодня»');

    await wrapper.get('a').trigger('click');
    await flushPromises();

    expect(router.currentRoute.value.path).toBe('/today');
  });
});
