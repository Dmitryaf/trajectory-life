<script setup lang="ts">
defineOptions({ inheritAttrs: false });

withDefaults(
  defineProps<{
    unsaved?: boolean;
    tone?: 'default' | 'areas' | 'career' | 'success' | 'brand' | 'purple' | 'orange';
  }>(),
  { tone: 'default' },
);
</script>

<template>
  <article class="settings-card" :class="`settings-card--tone-${tone}`" v-bind="$attrs">
    <slot />
    <p v-if="unsaved" class="settings-card-status" role="status">Есть несохранённые изменения</p>
  </article>
</template>

<style scoped src="./SettingsCard.css"></style>
