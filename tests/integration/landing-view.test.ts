// @vitest-environment happy-dom

import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import { describe, expect, it } from 'vitest';
import App from '@/App.vue';
import LandingPage from '@/features/landing/ui/LandingPage.vue';
import DataPolicy from '@/features/landing/ui/DataPolicy.vue';

function createLandingRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: LandingPage, meta: { publicLanding: true } },
      { path: '/data-policy', component: DataPolicy, meta: { publicPage: true } },
      { path: '/access', component: { template: '<div>Вход</div>' } },
      { path: '/today', component: { template: '<div>Сегодня</div>' } },
    ],
  });
}

describe('public landing', () => {
  it('explains the product and links to the configured access flow without mounting the product shell', async () => {
    const router = createLandingRouter();
    await router.push('/');
    await router.isReady();
    const wrapper = mount(App, { global: { plugins: [router] } });
    await flushPromises();

    expect(wrapper.get('h1').text()).toBe('Личный дневник');
    expect(wrapper.text()).not.toContain('Пример: от записи к своему выводу');
    expect(wrapper.text()).not.toContain('Пропуски остаются пропусками');
    expect(wrapper.text()).toContain('Траектория сама не отправляет ваши записи в нейросети');
    expect(wrapper.findAll('[role="tab"]')).toHaveLength(6);
    expect(wrapper.find('.data-policy-page').exists()).toBe(false);
    expect(wrapper.get('a[href="/data-policy"]').text()).toBe('Политика конфиденциальности');
    expect(wrapper.text()).not.toMatch(/Supabase|Vercel|Resend|Шифрование содержимого на стороне клиента/);
    expect(wrapper.find('.app-shell').exists()).toBe(false);
    expect(wrapper.findAll('a[href="/access?mode=sign-in"]')).toHaveLength(2);
    expect(wrapper.findAll('img')).toHaveLength(1);
  });

  it('opens the full policy as a public page without mounting the product shell', async () => {
    const router = createLandingRouter();
    await router.push('/data-policy');
    await router.isReady();
    const wrapper = mount(App, { global: { plugins: [router] } });
    await flushPromises();

    expect(wrapper.get('h1').text()).toBe('Политика конфиденциальности');
    expect(wrapper.findAll('h2')).toHaveLength(7);
    expect(wrapper.text()).toContain('Статистика использования');
    expect(wrapper.text()).toContain('старше 90 дней');
    expect(wrapper.text()).toContain('Регулярные резервные копии хранятся 30 дней');
    expect(wrapper.text()).not.toContain('Без сети запрос на удаление');
    expect(wrapper.text()).not.toContain('Скачанные файлы и записи на других устройствах');
    expect(wrapper.text()).not.toContain('очищаются по расписанию сервиса и его подрядчиков');
    expect(wrapper.find('details').exists()).toBe(false);
    expect(wrapper.find('.app-shell').exists()).toBe(false);
    expect(wrapper.text()).not.toMatch(/бесплат|Афонасенко|Дмитри|авторск/i);
    expect(wrapper.text()).not.toMatch(/Supabase|Vercel|Resend/);
    expect(wrapper.get('a[aria-label="Траектория — главная страница"]').attributes('href')).toBe('/');
  });
});
