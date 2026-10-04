<script setup lang="ts">
defineOptions({ inheritAttrs: false });

withDefaults(
  defineProps<{
    tone?: 'default' | 'areas' | 'career' | 'success' | 'brand' | 'purple' | 'orange';
  }>(),
  { tone: 'default' },
);
</script>

<template>
  <article class="settings-card" :class="`settings-card--tone-${tone}`" v-bind="$attrs">
    <slot />
  </article>
</template>

<style scoped src="./SettingsCard.css"></style>
