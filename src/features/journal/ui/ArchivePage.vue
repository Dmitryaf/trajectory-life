<script setup lang="ts">
import { RouterLink } from 'vue-router';
import { nextTick, ref, watch } from 'vue';
import UiIcon from '@/shared/ui/icons/UiIcon.vue';
import type { UiIconName } from '@/shared/ui/icons/icons';
import SurfaceCard from '@/shared/ui/layout/SurfaceCard.vue';
import SectionHeading from '@/shared/ui/layout/SectionHeading.vue';
import PageHeading from '@/shared/ui/layout/PageHeading.vue';
import PageShell from '@/shared/ui/layout/PageShell.vue';
import EyebrowText from '@/shared/ui/typography/EyebrowText.vue';
const props = defineProps<{
  tone: 'results' | 'events';
  editingId: number | null;
  emptyArchive: boolean;
  headingEyebrow: string;
  headingTitle: string;
  headingDescription: string;
  archiveEyebrow: string;
  archiveTitle: string;
  count: number;
  hasItems: boolean;
  emptyIcon: UiIconName;
  emptyTitle: string;
  emptyDescription: string;
}>();
const composer = ref<HTMLDetailsElement | null>(null);
let returnFocus: HTMLElement | null = null;
watch(
  () => props.editingId,
  async (id, previousId) => {
    if (id === null) {
      if (previousId !== null && returnFocus?.isConnected) {
        returnFocus.focus();
      }
      return;
    }
    returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    await nextTick();
    if (props.editingId === id) {
      composer.value?.querySelector<HTMLInputElement>('input[type="text"]')?.focus();
    }
  },
);
</script>

<template>
  <PageShell class="page--archive" :class="`page--${tone}`">
    <PageHeading>
      <div>
        <EyebrowText>{{ headingEyebrow }}</EyebrowText>
        <h1>{{ headingTitle }}</h1>
        <p>{{ headingDescription }}</p>
      </div>
    </PageHeading>

    <nav class="archive-navigation" aria-label="Разделы журнала">
      <RouterLink to="/results" :aria-current="tone === 'results' ? 'page' : undefined">Итоги</RouterLink>
      <RouterLink to="/events" :aria-current="tone === 'events' ? 'page' : undefined">События и мысли</RouterLink>
    </nav>
    <details ref="composer" class="archive-add" :open="editingId !== null || emptyArchive">
      <summary>{{ tone === 'results' ? 'Новый итог' : 'Новое событие или мысль' }}</summary>
      <SurfaceCard kind="form" class="result-composer archive-composer" :class="`archive-composer--${tone}`">
        <slot name="composer"></slot>
      </SurfaceCard>
    </details>

    <section class="archive-panel">
      <SectionHeading>
        <div>
          <EyebrowText>{{ archiveEyebrow }}</EyebrowText>
          <h2>{{ archiveTitle }}</h2>
        </div>
        <span class="archive-count">{{ count }}</span>
      </SectionHeading>
      <div class="archive-filters">
        <slot name="filters"></slot>
      </div>
      <slot v-if="hasItems"></slot>
      <div v-else class="archive-empty">
        <span><UiIcon :name="emptyIcon" /></span>
        <h3>{{ emptyTitle }}</h3>
        <p>{{ emptyDescription }}</p>
      </div>
    </section>
  </PageShell>
</template>

<style scoped>
.page--archive > .page-heading {
  position: relative;
  min-height: 132px;
  align-items: center;
  overflow: hidden;
  margin: 8px 0 14px;
  padding: 22px 24px;
  border-radius: 24px;
  box-shadow: var(--shadow-soft);
}
.page--archive > .page-heading::after {
  content: '';
  position: absolute;
  width: 168px;
  height: 168px;
  right: -42px;
  bottom: -128px;
  border-radius: 50%;
  opacity: 0.5;
}
.page--archive > .page-heading > * {
  position: relative;
  z-index: 1;
}
.page--archive > .page-heading h1 {
  margin-top: 3px;
  font-size: clamp(34px, 4vw, 44px);
  letter-spacing: -0.035em;
}
.page--archive > .page-heading p {
  font-size: 14px;
}
.page--results > .page-heading {
  border: 1px solid var(--archive-result-border);
  background: linear-gradient(135deg, var(--archive-result-surface-start), var(--archive-result-surface-end));
}
.page--results > .page-heading::after {
  background: var(--mint);
}
.page--events > .page-heading {
  border: 1px solid var(--archive-event-border);
  background: linear-gradient(135deg, var(--archive-event-surface-start), var(--archive-event-surface-end));
}
.page--events > .page-heading::after {
  background: var(--brand-mark-highlight);
}
.archive-navigation {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  margin-bottom: 16px;
}
.archive-navigation a {
  color: var(--brand-strong);
  text-underline-offset: 4px;
}
.archive-navigation a[aria-current] {
  font-weight: 750;
}
.archive-add {
  margin-bottom: 16px;
}
.archive-add > summary {
  min-height: 44px;
  padding-block: 10px;
  color: var(--brand-strong);
  cursor: pointer;
  font-weight: 650;
}
.archive-composer {
  position: relative;
  margin-bottom: 16px;
  padding: 20px 22px;
  border-radius: 22px;
  overflow: hidden;
  box-shadow: 0 12px 30px var(--archive-card-shadow);
}
.archive-composer::before {
  content: '';
  position: absolute;
  inset: 0 auto 0 0;
  width: 5px;
  background: var(--status-success);
}
.archive-composer--events::before {
  background: var(--amber);
}
:deep(.composer-cancel) {
  margin-top: 10px;
}
:deep(.archive-composer .form-card__heading) {
  margin-bottom: 16px;
}
.archive-panel {
  padding: 20px;
  border: 1px solid var(--archive-group-border);
  border-radius: 22px;
  background: var(--archive-group-surface);
  box-shadow: 0 12px 34px var(--archive-group-shadow);
}
.archive-panel > .section-heading {
  padding-bottom: 12px;
  border-bottom: 1px solid var(--archive-group-divider);
}
.archive-count {
  min-width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  border-radius: 999px;
  background: var(--archive-result-badge-surface);
  color: var(--archive-result-badge-text);
  font-weight: 750;
}
.page--events .archive-count {
  background: var(--archive-event-surface-end);
  color: var(--archive-event-badge-text);
}
.archive-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: start;
  margin-bottom: 14px;
  padding: 12px;
  border: 1px solid var(--archive-entry-border);
  border-radius: 17px;
  background: var(--archive-entry-surface);
}
.archive-filters > :deep(.archive-filter-field) {
  flex: 1.35 1 220px;
}
.archive-filters > :deep(.archive-filter-field:nth-child(2)) {
  flex: 0.9 1 170px;
}
.page--events .archive-filters {
  border-color: var(--archive-event-entry-border);
  background: var(--archive-event-entry-surface);
}
:deep(.archive-filter-field) {
  width: 100%;
  min-width: 0;
  display: grid;
  grid-template-rows: auto 48px;
  gap: 6px;
}
:deep(.archive-filter-field__label) {
  color: var(--archive-date-label);
  font-size: 12px;
  font-weight: 700;
  line-height: 1.25;
}
:deep(.archive-filter-field > input),
:deep(.archive-filter-field > select) {
  min-width: 0;
  height: 48px;
}
.archive-empty {
  padding: 34px 22px;
  border: 1px dashed var(--archive-empty-border);
  border-radius: 20px;
  color: var(--muted);
  text-align: center;
}
.archive-empty > span {
  color: var(--accent-dark);
  font-size: 30px;
}
.archive-empty h3 {
  margin: 10px 0 5px;
  color: var(--text);
}
.archive-empty p {
  margin-bottom: 0;
}
:deep(.archive-list-enter-active),
:deep(.archive-list-leave-active),
:deep(.archive-list-move) {
  transition:
    opacity var(--motion-base) var(--motion-ease),
    transform var(--motion-base) var(--motion-ease);
}
:deep(.archive-list-enter-from),
:deep(.archive-list-leave-to) {
  opacity: 0;
  transform: translateY(-6px) scale(0.99);
}
:deep(.archive-list-leave-active) {
  position: absolute;
  width: 100%;
}
@media (max-width: 1023px) {
  .archive-filters {
    display: grid;
    grid-template-columns: 1fr 1fr;
  }
}
@media (max-width: 720px) {
  .page--archive > .page-heading {
    min-height: 102px;
    margin: 4px 0 12px;
    padding: 15px 18px;
    border-radius: 20px;
  }
  .page--archive > .page-heading :deep(.eyebrow) {
    display: none;
  }
  .page--archive > .page-heading h1 {
    margin-bottom: 6px;
    font-size: 32px;
  }
  .page--archive > .page-heading p {
    font-size: 13px;
  }
  .page--archive > .page-heading::after {
    right: -82px;
    bottom: -142px;
  }
  .archive-composer,
  .archive-panel {
    padding: 16px;
    border-radius: 18px;
  }
}
@media (max-width: 520px) {
  .archive-filters {
    grid-template-columns: 1fr;
  }
}
</style>
