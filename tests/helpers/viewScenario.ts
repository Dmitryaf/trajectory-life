import { enableAutoUnmount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, vi } from 'vitest';
import { useAppStore } from '@/stores/app';
import { defaultSettings } from '@/types';

enableAutoUnmount(afterEach);

const routerLinkStub = {
  props: ['to'],
  template: '<a :href="to"><slot /></a>',
};

function createStore() {
  const pinia = createPinia();
  setActivePinia(pinia);
  const store = useAppStore();
  store.loaded = true;
  store.settings = structuredClone(defaultSettings);
  store.settings.firstUse = {
    status: 'completed',
    weekStart: '2026-07-13',
    periodEnd: '2026-07-19',
    lastStep: 'overview',
    overviewSeen: true,
    updatedAt: '2026-07-20T12:00:00.000Z',
  };
  return { pinia, store };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 6, 21, 12));
  vi.clearAllMocks();
  // happy-dom does not implement native dialogs; never imply confirmation by default.
  vi.stubGlobal(
    'confirm',
    vi.fn(() => false),
  );
  vi.stubGlobal(
    'prompt',
    vi.fn(() => null),
  );
  window.history.replaceState(null, '', '/');
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

export { createStore, routerLinkStub };
