import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createWebHistory } from 'vue-router';
import App from './App.vue';
import { installAuthenticatedLandingRedirect } from './features/auth/publicEntry';
import './style.css';

const preloadRecoveryKey = 'trajectory:preload-recovery';

window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault();
  if (window.sessionStorage.getItem(preloadRecoveryKey)) {
    return;
  }
  window.sessionStorage.setItem(preloadRecoveryKey, '1');
  window.location.reload();
});

let productPwaRuntime: Promise<void> | undefined;

function startProductPwaRuntime(): Promise<void> {
  productPwaRuntime ??= Promise.all([import('virtual:pwa-register'), import('./features/pwa/installation')]).then(
    ([{ registerSW }, { initPwaInstallation }]) => {
      initPwaInstallation();
      registerSW({ immediate: true });
    },
  );
  return productPwaRuntime;
}

const router = createRouter({
  history: createWebHistory(),
  scrollBehavior(to) {
    if (to.hash) {
      return { el: to.hash, top: 88, behavior: 'smooth' };
    }
    return { top: 0 };
  },
  routes: [
    { path: '/', component: () => import('./views/LandingView.vue'), meta: { title: 'Личная картина времени', publicLanding: true } },
    {
      path: '/data-policy',
      component: () => import('./views/DataPolicyView.vue'),
      meta: { title: 'Политика конфиденциальности', publicPage: true },
    },
    {
      path: '/terms',
      component: () => import('./views/TermsOfUseView.vue'),
      meta: { title: 'Условия использования', publicPage: true },
    },
    { path: '/access', component: () => import('./views/AccessView.vue'), meta: { title: 'Вход' } },
    { path: '/today', component: () => import('./views/TodayView.vue'), meta: { title: 'Сегодня' } },
    { path: '/results', component: () => import('./views/ResultsView.vue'), meta: { title: 'Итоги' } },
    { path: '/events', component: () => import('./views/EventsView.vue'), meta: { title: 'События' } },
    {
      path: '/week',
      component: () => import('./views/WeekView.vue'),
      props: (route) => ({ initialWeek: typeof route.query.week === 'string' ? route.query.week : '' }),
      meta: { title: 'Неделя' },
    },
    { path: '/month', component: () => import('./views/MonthView.vue'), meta: { title: 'Месяц' } },
    { path: '/trends', component: () => import('./views/TrendsView.vue'), meta: { title: 'История изменений' } },
    { path: '/more', component: () => import('./views/MoreView.vue'), meta: { title: 'Журнал' } },
    { path: '/settings', component: () => import('./views/SettingsView.vue'), meta: { title: 'Настройки' } },
    { path: '/password-reset', component: () => import('./views/PasswordResetView.vue'), meta: { title: 'Новый пароль' } },
    { path: '/:pathMatch(.*)*', component: () => import('./views/NotFoundView.vue'), meta: { title: 'Страница не найдена' } },
  ],
});

installAuthenticatedLandingRedirect(router);

router.afterEach((to) => {
  document.title = to.meta.publicLanding ? 'Траектория — личная картина времени' : `${String(to.meta.title)} · Траектория`;
  if (!to.meta.publicLanding && !to.meta.publicPage) {
    void startProductPwaRuntime();
  }
});

const app = createApp(App).use(createPinia()).use(router);

void router.isReady().then(() => {
  window.sessionStorage.removeItem(preloadRecoveryKey);
  app.mount('#app');
});
