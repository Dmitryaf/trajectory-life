<script setup lang="ts">
import { computed } from 'vue';
import PageHeading from '@/shared/ui/layout/PageHeading.vue';
import UiIcon from '@/shared/ui/icons/UiIcon.vue';
import EyebrowText from '@/shared/ui/typography/EyebrowText.vue';
import ReviewPeriodNavigation from './ReviewPeriodNavigation.vue';

const props = defineProps<{
  label?: string;
  title: string;
  summary: string;
  action?: string;
  href?: string;
  period?: 'week' | 'month';
}>();

const periodLabels = { week: 'Недельная сводка', month: 'Месячная сводка' } as const;
const headingLabel = computed(() => props.label ?? (props.period ? periodLabels[props.period] : ''));
</script>

<template>
  <PageHeading>
    <div>
      <EyebrowText>{{ headingLabel }}</EyebrowText>
      <h1>{{ title }}</h1>
      <p>{{ summary }}</p>
    </div>
    <a v-if="action && href" class="review-jump" :href="href"
      >{{ action }} <span><UiIcon name="arrow-down" /></span
    ></a>
  </PageHeading>
  <ReviewPeriodNavigation v-if="period" :period="period" />
</template>

<style scoped>
.page-heading {
  position: relative;
  min-height: 0;
  align-items: center;
  overflow: hidden;
  margin: 10px 0 16px;
  padding: 18px 22px;
  border: 1px solid var(--review-heading-border);
  border-radius: 18px;
  background: var(--surface);
  box-shadow: none;
}
.page-heading > * {
  position: relative;
  z-index: 1;
}
.page-heading h1 {
  margin-top: 5px;
  font-size: clamp(30px, 4vw, 40px);
  letter-spacing: -0.045em;
}
.page-heading p {
  max-width: 520px;
}
.review-jump {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 9px;
  min-height: 42px;
  padding: 10px 14px;
  border: 1px solid var(--review-heading-chip-border);
  border-radius: 14px;
  background: var(--review-heading-chip-surface);
  color: var(--review-heading-chip-text);
  font-size: 13px;
  font-weight: 800;
  text-decoration: none;
}
.review-jump span {
  color: var(--review-heading-accent);
  font-size: 16px;
}
@media (max-width: 720px) {
  .page-heading {
    min-height: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: end;
    gap: 12px;
    margin: 4px 0 14px;
    padding: 18px;
    border-radius: 24px;
  }
  .page-heading > div {
    min-width: 0;
  }
  .page-heading h1 {
    margin-top: 2px;
    font-size: 30px;
  }
  .page-heading p {
    font-size: 14px;
    line-height: 1.42;
  }
  .review-jump {
    min-height: 38px;
    padding: 8px 11px;
  }
}
</style>
