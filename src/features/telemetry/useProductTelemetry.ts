import { nextTick, onBeforeUnmount, onMounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import type { ProductEventName } from '@/model/productTelemetry';
import { emitProductEvent, productTelemetry, telemetryState } from './productTelemetry';

const routeEvents: Record<string, ProductEventName> = {
  '/week': 'week_opened',
  '/month': 'month_opened',
  '/trends': 'history_opened',
  '/more': 'journal_opened',
};
export function useProductTelemetry(ready: () => boolean) {
  const auth = useAuthStore();
  const router = useRouter();
  let opened = false;
  let lastPath = '';
  const flush = () => {
    if (document.visibilityState === 'visible') {
      void productTelemetry.flush();
    }
  };
  const storage = (event: StorageEvent) => productTelemetry.storageChanged(event.key);
  watch(
    () => [auth.session?.user.id ?? '', auth.session?.access_token ?? ''] as const,
    ([owner, token], previous) => {
      if (previous?.[0] !== owner) {
        opened = false;
        lastPath = '';
      }
      productTelemetry.setSession(owner, token);
    },
    { immediate: true, flush: 'sync' },
  );
  watch(
    () => [ready(), telemetryState.enabled, router.currentRoute.value.path, auth.session?.user.id] as const,
    async ([loaded, enabled, path, owner]) => {
      if (!loaded || !enabled) {
        lastPath = '';
        return;
      }
      await nextTick();
      if (!ready() || !telemetryState.enabled || path !== router.currentRoute.value.path || owner !== auth.session?.user.id) {
        return;
      }
      if (!opened) {
        emitProductEvent('app_opened', {});
        opened = true;
      }
      if (lastPath !== path && routeEvents[path]) {
        emitProductEvent(routeEvents[path], {});
      }
      lastPath = path;
    },
    { flush: 'post' },
  );
  onMounted(() => {
    window.addEventListener('storage', storage);
  });
  onBeforeUnmount(() => {
    window.removeEventListener('storage', storage);
    productTelemetry.stop();
  });
  return flush;
}
