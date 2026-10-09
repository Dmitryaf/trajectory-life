import { createApp, type App } from 'vue';
import { createPinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import { useAppStore } from '@/stores/app';
import { productTelemetry } from '@/features/telemetry/productTelemetry';
import ConsentExperience from '@/features/telemetry/ui/ConsentExperience.vue';
import TelemetryConsent from '@/features/telemetry/ui/TelemetryConsent.vue';
import { emptyDailyEntry } from '@/types';

// Browser-only fixture: use Vite-resolved imports so Vue injection symbols are shared.
export async function mountConsentExperience(componentName: string, experienced: boolean) {
  const original = document.getElementById('app') as HTMLElement & { __vue_app__?: App };
  original.__vue_app__?.unmount();
  const pinia = createPinia();
  const store = useAppStore(pinia);
  store.cloudSyncStatus = 'idle';
  store.settings.firstUse.status = experienced ? 'completed' : 'not_started';
  if (experienced) {
    store.dailyEntries = [{ ...emptyDailyEntry('2026-10-09'), importantFact: 'Синтетическая сохранённая запись' }];
  }
  const host = document.createElement('main');
  host.id = 'telemetry-experience-test';
  host.className = 'app-main';
  host.style.cssText = 'max-width:700px;margin:auto;padding:20px';
  const mount = document.createElement('div');
  host.append(mount);
  const heading = document.createElement('h2');
  heading.id = 'next-heading';
  heading.textContent = 'Ваша первая запись';
  host.append(heading);
  const input = document.createElement('input');
  input.setAttribute('aria-label', 'Заметка');
  host.append(input);
  document.getElementById('app')!.style.display = 'none';
  document.body.prepend(host);
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/today', component: { render: () => null } }] });
  const app = createApp(componentName === 'TelemetryConsent' ? TelemetryConsent : ConsentExperience);
  app.use(pinia);
  app.use(router);
  await router.push('/today');
  await router.isReady();
  app.mount(mount);
  productTelemetry.setSession('consent-e2e-account', 'synthetic-access-token');
}
