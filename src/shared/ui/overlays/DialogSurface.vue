<script setup lang="ts">
import { ref } from 'vue';

defineOptions({ inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    labelledby: string;
    backdropClass?: string;
    panelClass?: string;
    mobile?: 'card' | 'sheet';
    width?: string;
    padding?: string;
  }>(),
  { backdropClass: '', panelClass: '', mobile: 'card', width: 'min(560px, 100%)', padding: '26px' },
);

const element = ref<HTMLElement>();
defineExpose({ element });
</script>

<template>
  <div
    class="dialog-backdrop"
    :class="[backdropClass, `dialog-backdrop--${mobile}`]"
    :style="{ '--dialog-width': props.width, '--dialog-padding': props.padding }"
    v-bind="$attrs"
  >
    <section ref="element" class="dialog-surface" :class="panelClass" role="dialog" aria-modal="true" :aria-labelledby="labelledby">
      <slot />
    </section>
  </div>
</template>

<style scoped>
.dialog-backdrop {
  position: fixed;
  inset: 0;
  height: var(--viewport-height);
  z-index: 80;
  display: grid;
  place-items: center;
  padding: calc(20px + var(--safe-top)) calc(20px + var(--safe-right)) calc(20px + var(--safe-bottom)) calc(20px + var(--safe-left));
  background: var(--overlay-scrim);
  backdrop-filter: blur(5px);
}
.dialog-surface {
  width: var(--dialog-width);
  max-height: 100%;
  padding: var(--dialog-padding);
  overflow-y: auto;
  overscroll-behavior: contain;
  border: 1px solid var(--dialog-border);
  border-radius: 26px;
  background: var(--surface);
  box-shadow: 0 30px 80px var(--dialog-shadow);
}
.dialog-surface :deep(.dialog-heading) {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 18px;
}
.dialog-surface :deep(.dialog-heading h2) {
  margin: 0;
  color: var(--navy);
}
.dialog-surface :deep(.dialog-actions) {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
@media (max-width: 720px) {
  .dialog-backdrop--card {
    align-items: end;
    padding: calc(10px + var(--safe-top)) calc(10px + var(--safe-right)) calc(10px + var(--safe-bottom)) calc(10px + var(--safe-left));
  }
  .dialog-backdrop--card .dialog-surface {
    padding: 20px;
    border-radius: 22px;
  }
  .dialog-backdrop--sheet {
    align-items: end;
    padding: var(--safe-top) var(--safe-right) 0 var(--safe-left);
  }
  .dialog-backdrop--sheet .dialog-surface {
    width: 100%;
    max-height: calc(100% - 24px);
    padding: 22px 18px calc(22px + var(--safe-bottom));
    border-radius: 24px 24px 0 0;
  }
}
</style>
