<script setup lang="ts">
import { RouterLink } from 'vue-router';
import { computed } from 'vue';
import { formatDate } from '@/services/dates';
import SurfaceCard from '@/shared/ui/layout/SurfaceCard.vue';
import SectionHeading from '@/shared/ui/layout/SectionHeading.vue';
import ClampedText from '@/shared/ui/content/ClampedText.vue';
import type { monthWeekReviews } from '../monthWeeks';

const props = defineProps<{ weeks: ReturnType<typeof monthWeekReviews> }>();
const cards = computed(() =>
  props.weeks.map((week) => {
    const groups: { label: string; texts: string[] }[] = [];
    for (const field of week.fields) {
      const group = groups.find((item) => item.label === field.label);
      if (group) {
        group.texts.push(field.text);
      } else {
        groups.push({ label: field.label, texts: [field.text] });
      }
    }
    return { ...week, groups };
  }),
);
</script>

<template>
  <SurfaceCard v-if="weeks.length" kind="dashboard" class="month-week-reviews">
    <SectionHeading>
      <div>
        <h2>Что вы заметили за недели</h2>
        <p>Сохранённые выводы помогут вспомнить месяц.</p>
      </div>
    </SectionHeading>
    <div class="month-week-reviews__list">
      <article v-for="week in cards" :key="week.review.weekStart" class="month-week-reviews__week">
        <h3>
          <RouterLink :to="`/week?week=${week.review.weekStart}#week-review`">
            {{ formatDate(week.review.weekStart, { day: 'numeric', month: 'short' }) }}–{{
              formatDate(week.weekEnd, { day: 'numeric', month: 'short' })
            }}
          </RouterLink>
        </h3>
        <p v-if="week.crossesMonth" class="month-week-reviews__note">Обзор всей недели, включая дни соседнего месяца.</p>
        <p v-if="week.review.coveredThrough" class="month-week-reviews__note">
          Восстановленные записи по {{ formatDate(week.review.coveredThrough, { day: 'numeric', month: 'short' }) }} включительно.
        </p>
        <div class="month-week-reviews__lead">
          <h4>{{ week.groups[0]!.label === 'Итог' ? 'Итоги' : week.groups[0]!.label }}</h4>
          <ul :class="{ 'month-week-reviews__single': week.groups[0]!.texts.length === 1 }">
            <li v-for="(text, index) in week.groups[0]!.texts" :key="index">
              <ClampedText :text="text" :content-id="`week-summary-${week.review.weekStart}-${index}`" />
            </li>
          </ul>
        </div>
        <details v-if="week.groups.length > 1" class="month-week-reviews__details">
          <summary>Остальные записи обзора</summary>
          <div class="month-week-reviews__fields">
            <section v-for="(group, index) in week.groups.slice(1)" :key="group.label" class="month-week-reviews__field">
              <h4>{{ group.label === 'Итог' ? 'Итоги' : group.label }}</h4>
              <ul :class="{ 'month-week-reviews__single': group.texts.length === 1 }">
                <li v-for="(text, itemIndex) in group.texts" :key="itemIndex">
                  <ClampedText :text="text" :content-id="`week-detail-${week.review.weekStart}-${index}-${itemIndex}`" />
                </li>
              </ul>
            </section>
          </div>
        </details>
      </article>
    </div>
  </SurfaceCard>
</template>

<style scoped>
.month-week-reviews {
  margin-bottom: 16px;
}
.month-week-reviews__list {
  display: grid;
  gap: 16px;
}
.month-week-reviews__week {
  min-width: 0;
  padding: 20px;
  border: 1px solid var(--line);
  border-radius: 16px;
  background: var(--surface-soft);
  overflow-wrap: anywhere;
}
.month-week-reviews__week h3 {
  margin: 0 0 12px;
  font-size: 17px;
}
.month-week-reviews__week a {
  color: var(--brand-strong);
}
.month-week-reviews__note {
  margin: 0 0 8px;
  color: var(--muted);
  font-size: 13px;
}
.month-week-reviews__week h4 {
  margin: 0 0 6px;
  color: var(--brand-strong);
  font-size: 13px;
  font-weight: 700;
}
.month-week-reviews__week ul {
  margin: 0;
  padding-left: 20px;
}
.month-week-reviews__week .month-week-reviews__single {
  padding-left: 0;
  list-style: none;
}
.month-week-reviews__week li + li {
  margin-top: 8px;
}
.month-week-reviews__week :deep(.clamped-text) {
  margin: 0;
  line-height: 1.6;
  white-space: pre-wrap;
}
.month-week-reviews__lead {
  margin-top: 16px;
  padding-left: 14px;
  border-left: 3px solid var(--line-success);
}
.month-week-reviews__details {
  margin-top: 16px;
  border-top: 1px solid var(--line);
}
.month-week-reviews__details summary {
  padding-block: 12px;
  color: var(--brand-strong);
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
}
.month-week-reviews__details summary:focus-visible {
  border-radius: 4px;
  outline: 2px solid var(--focus-ring);
  outline-offset: 3px;
}
.month-week-reviews__fields {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 280px), 1fr));
  gap: 20px 28px;
  padding-top: 8px;
}
.month-week-reviews__field {
  min-width: 0;
}
@media (max-width: 480px) {
  .month-week-reviews__week {
    padding: 16px;
  }
}
</style>
