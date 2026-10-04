<script setup lang="ts">
import SurfaceCard from '@/shared/ui/layout/SurfaceCard.vue';
import SectionHeading from '@/shared/ui/layout/SectionHeading.vue';
import EyebrowText from '@/shared/ui/typography/EyebrowText.vue';
import { careerStatesForEntry } from '@/features/analytics/periodSummary';
import { specialDayLabel } from '@/features/analytics/presentation';
import { formatDate, formatMinutes, todayKey } from '@/services/dates';
import type { DailyEntry } from '@/types';

type RhythmDay = { day: string; entry?: DailyEntry };

defineProps<{ days: RhythmDay[] }>();

function dayFacts(item: RhythmDay): string[] {
  const { entry } = item;
  if (!entry) {
    return [];
  }

  const facts: string[] = [];
  if (entry.sleepMinutes !== null) {
    facts.push(`Сон ${formatMinutes(entry.sleepMinutes)}`);
  }
  if (entry.energy !== null) {
    facts.push(`Энергия ${entry.energy}/5`);
  }
  if (careerStatesForEntry(entry).length) {
    facts.push('Работа');
  }
  if (entry.actionDirection === 'external') {
    facts.push('Шаг к цели');
  }
  if (entry.actionDirection === 'drift') {
    facts.push('Другие дела');
  }
  if (entry.activities.some((activity) => activity !== 'recovery')) {
    facts.push('Физическая активность');
  }
  if (entry.nutritionState === 'supports_goal') {
    facts.push('Питание поддерживало');
  }
  if (entry.nutritionState === 'neutral') {
    facts.push('Питание нейтрально');
  }
  if (entry.nutritionState === 'blocks_goal') {
    facts.push('Питание мешало');
  }
  if (entry.specialDay) {
    facts.push(specialDayLabel(entry.specialDay));
  }
  return facts;
}
</script>

<template>
  <SurfaceCard kind="dashboard" class="weekly-rhythm-card">
    <SectionHeading>
      <div>
        <EyebrowText>Факты по дням</EyebrowText>
        <h2>Как проходила неделя</h2>
      </div>
    </SectionHeading>
    <div class="week-story-list">
      <article v-for="item in days" :key="item.day" class="week-story-day" :class="{ 'week-story-day--empty': !item.entry }">
        <time>{{ formatDate(item.day, { weekday: 'short', day: 'numeric' }) }}</time>
        <div>
          <strong v-if="item.entry?.importantFact">{{ item.entry.importantFact }}</strong>
          <span v-else>{{ item.entry ? 'Запись без заметки дня' : item.day > todayKey() ? 'День ещё не наступил' : 'Записи нет' }}</span>
          <div v-if="dayFacts(item).length" class="week-story-day__facts">
            <small v-for="fact in dayFacts(item)" :key="fact">{{ fact }}</small>
          </div>
        </div>
      </article>
    </div>
  </SurfaceCard>
</template>

<style scoped>
.weekly-rhythm-card {
  position: relative;
  margin-bottom: 16px;
  border-color: var(--weekly-rhythm-border);
  box-shadow: 0 10px 28px var(--weekly-rhythm-shadow);
}
.weekly-rhythm-card > .section-heading {
  padding-bottom: 15px;
  border-bottom: 1px solid var(--review-section-divider);
}
.week-story-list {
  display: grid;
  gap: 8px;
}
.week-story-day {
  display: grid;
  grid-template-columns: 88px minmax(0, 1fr);
  gap: 12px;
  align-items: start;
  padding: 12px 14px;
  border: 1px solid var(--weekly-rhythm-item-border);
  border-radius: 14px;
  background: var(--weekly-rhythm-item-surface);
}
.week-story-day--empty {
  background: var(--weekly-rhythm-item-alt-surface);
}
.week-story-day time {
  color: var(--weekly-rhythm-meta);
  font-size: 12px;
  font-weight: 800;
  text-transform: capitalize;
}
.week-story-day strong,
.week-story-day > div > span {
  display: block;
  color: var(--weekly-rhythm-text);
  font-size: 13px;
  line-height: 1.45;
}
.week-story-day--empty > div > span {
  color: var(--muted);
}
.week-story-day__facts {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 8px;
}
.week-story-day__facts small {
  padding: 4px 7px;
  border-radius: 999px;
  background: var(--weekly-rhythm-pill-surface);
  color: var(--weekly-rhythm-pill-text);
  font-size: 10px;
  font-weight: 750;
}
@media (max-width: 720px) {
  .week-story-day {
    grid-template-columns: 1fr;
    gap: 5px;
  }
}
</style>
