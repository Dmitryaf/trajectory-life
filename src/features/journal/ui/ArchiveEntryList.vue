<script setup lang="ts">
import StableHeightTransitionGroup from '@/shared/ui/layout/StableHeightTransitionGroup.vue';
import ArchivePagination from './ArchivePagination.vue';

const props = defineProps<{
  tone: 'results' | 'events';
  page: number;
  pageCount: number;
  contextLabel: string;
}>();

const emit = defineEmits<{
  'update:page': [value: number];
}>();

const legacyListClass = props.tone === 'results' ? 'results-list' : 'timeline-list';
</script>

<template>
  <div>
    <StableHeightTransitionGroup name="archive-list" :change-key="page" tag="div" class="archive-entry-list" :class="legacyListClass">
      <slot></slot>
    </StableHeightTransitionGroup>
    <ArchivePagination :page="page" :page-count="pageCount" :context-label="contextLabel" @update:page="emit('update:page', $event)" />
  </div>
</template>

<style scoped>
.archive-entry-list {
  position: relative;
  display: grid;
  gap: 10px;
}

.results-list {
  gap: 9px;
}
</style>
