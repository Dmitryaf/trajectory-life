<script setup lang="ts">
import { onBeforeUnmount, ref, watch, type ComponentPublicInstance } from 'vue';

defineOptions({ inheritAttrs: false });
const props = withDefaults(defineProps<{ name: string; changeKey: string | number; tag?: string }>(), { tag: 'div' });

const group = ref<HTMLElement | ComponentPublicInstance>();
let previousHeight: number | null = null;
let animationFrame = 0;
let cleanupTimer = 0;

function element() {
  if (group.value instanceof HTMLElement) {
    return group.value;
  }
  const root = group.value?.$el;
  return root instanceof HTMLElement ? root : null;
}

function cancelCleanup() {
  window.cancelAnimationFrame(animationFrame);
  window.clearTimeout(cleanupTimer);
}

function releaseHeight(target = element()) {
  cancelCleanup();
  target?.style.removeProperty('height');
}

function animateHeight() {
  const target = element();
  const startHeight = previousHeight;
  previousHeight = null;
  if (!target || startHeight === null) {
    return;
  }

  target.style.transition = 'none';
  target.style.height = 'auto';
  const endHeight = target.getBoundingClientRect().height;
  target.style.height = `${startHeight}px`;
  void target.offsetHeight;

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || Math.abs(endHeight - startHeight) < 1) {
    target.style.removeProperty('transition');
    releaseHeight(target);
    return;
  }

  target.style.removeProperty('transition');
  animationFrame = window.requestAnimationFrame(() => {
    target.style.height = `${endHeight}px`;
  });
  cleanupTimer = window.setTimeout(() => releaseHeight(target), 500);
}

watch(
  () => props.changeKey,
  () => {
    const target = element();
    previousHeight = target?.getBoundingClientRect().height ?? null;
    cancelCleanup();
  },
  { flush: 'sync' },
);

watch(() => props.changeKey, animateHeight, { flush: 'post' });

function onTransitionEnd(event: TransitionEvent) {
  if (event.target === element() && event.propertyName === 'height') {
    releaseHeight(event.target as HTMLElement);
  }
}

onBeforeUnmount(cancelCleanup);
</script>

<template>
  <TransitionGroup
    ref="group"
    class="stable-height-transition-group"
    :name="name"
    :tag="tag"
    v-bind="$attrs"
    @transitionend="onTransitionEnd"
  >
    <slot></slot>
  </TransitionGroup>
</template>

<style scoped>
.stable-height-transition-group {
  overflow: clip;
  transition: height var(--motion-layout) var(--motion-layout-ease);
}

@media (prefers-reduced-motion: reduce) {
  .stable-height-transition-group {
    transition: none;
  }
}
</style>
