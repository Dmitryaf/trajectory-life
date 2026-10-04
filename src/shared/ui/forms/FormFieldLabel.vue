<script setup lang="ts">
defineOptions({ inheritAttrs: false });
withDefaults(defineProps<{ tag?: 'label' | 'span'; optional?: boolean }>(), { tag: 'label', optional: false });
</script>

<template>
  <component :is="tag" class="field-label" v-bind="$attrs">
    <slot />
    <template v-if="optional">{{ ' ' }}<span class="field-optional">необязательно</span></template>
  </component>
</template>

<style scoped>
.field-label {
  display: block;
  margin: 16px 0 8px;
  color: var(--form-field-label);
  font-size: 12px;
  font-weight: 750;
}
.field-optional {
  color: var(--form-field-hint);
  font-size: 11px;
  font-weight: 650;
  text-transform: none;
}
</style>
