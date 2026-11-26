<script setup lang="ts">
import ArchiveItemActions from './ArchiveItemActions.vue';

const props = defineProps<{
  tone: 'results' | 'events';
  icon?: string;
  title: string;
  metadata: string;
}>();

const legacyItemClass = props.tone === 'results' ? 'result-item' : 'timeline-item';
const legacyIconClass = props.tone === 'results' ? 'result-item__icon' : 'timeline-item__icon';
const legacyContentClass = props.tone === 'results' ? 'result-item__content' : undefined;
</script>

<template>
  <article class="archive-entry" :class="[`archive-entry--${tone}`, legacyItemClass]">
    <span class="archive-entry__icon" :class="legacyIconClass">{{ icon }}</span>
    <div class="archive-entry__content" :class="legacyContentClass">
      <strong>{{ title }}</strong>
      <small>{{ metadata }}</small>
      <slot></slot>
    </div>
    <ArchiveItemActions :title="title">
      <slot name="actions"></slot>
    </ArchiveItemActions>
  </article>
</template>

<style scoped>
.archive-entry {
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr);
  gap: 6px 13px;
  align-items: start;
  padding: 15px 16px;
  border: 1px solid var(--events-card-border);
  border-radius: 17px;
  background: linear-gradient(135deg, var(--events-card-gradient), var(--surface));
}

.archive-entry--results {
  align-items: center;
  border-color: var(--results-card-border);
  background: linear-gradient(135deg, var(--results-card-gradient), var(--surface));
}

.archive-entry__icon {
  width: 42px;
  height: 42px;
  display: grid;
  place-items: center;
  border-radius: 13px;
  background: var(--archive-event-surface-end);
  color: var(--more-view-event-text);
  font-weight: 850;
}

.archive-entry--results .archive-entry__icon {
  background: var(--results-card-icon-surface);
  color: var(--results-card-icon-text);
  font-weight: 800;
}

.archive-entry__content {
  min-width: 0;
}

.archive-entry strong,
.archive-entry small {
  display: block;
}

.archive-entry strong {
  overflow-wrap: anywhere;
}

.archive-entry small {
  margin-top: 4px;
  color: var(--muted);
}

@media (max-width: 520px) {
  .archive-entry--events > :deep(.archive-item-actions) {
    grid-column: 2;
  }
}
</style>
