<script setup lang="ts">
import { reactive, ref, watch } from 'vue';
import ArchivePagination from '@/features/journal/ui/ArchivePagination.vue';
import ActionButton from '@/shared/ui/actions/ActionButton.vue';
import FormHint from '@/shared/ui/forms/FormHint.vue';
import CountBadge from '@/shared/ui/data-display/CountBadge.vue';
import SurfaceCard from '@/shared/ui/layout/SurfaceCard.vue';
import SectionHeading from '@/shared/ui/layout/SectionHeading.vue';
import EyebrowText from '@/shared/ui/typography/EyebrowText.vue';
import { formatDate } from '@/services/dates';
import { experimentDecisionLabel } from '../model';
import type { WeeklyExperimentCard } from '../weeklyReview';

const props = defineProps<{ experiments: WeeklyExperimentCard[] }>();
const openExperimentId = ref('');
const openExperimentNotesId = ref('');
const experimentNotePages = reactive<Record<string, number>>({});

watch(
  () => props.experiments.map((experiment) => experiment.id).join('|'),
  () => {
    if (!props.experiments.some((experiment) => experiment.id === openExperimentId.value)) {
      openExperimentId.value = props.experiments.find((experiment) => experiment.active)?.id ?? props.experiments[0]?.id ?? '';
    }
    if (!props.experiments.some((experiment) => experiment.id === openExperimentNotesId.value)) {
      openExperimentNotesId.value = '';
    }
  },
  { immediate: true },
);

function handleExperimentToggle(event: Event, id: string): void {
  const details = event.currentTarget as HTMLDetailsElement;
  if (details.open) {
    openExperimentId.value = id;
  } else if (openExperimentId.value === id) {
    openExperimentId.value = '';
  }
}

function toggleExperimentNotes(id: string): void {
  openExperimentNotesId.value = openExperimentNotesId.value === id ? '' : id;
  if (!experimentNotePages[id]) {
    experimentNotePages[id] = 1;
  }
}

function experimentNotePage(id: string): number {
  return experimentNotePages[id] ?? 1;
}

function visibleExperimentNote(experiment: WeeklyExperimentCard) {
  return experiment.notes[experimentNotePage(experiment.id) - 1] ?? null;
}

function experimentNoteStatus(experiment: WeeklyExperimentCard): string {
  const entry = visibleExperimentNote(experiment);
  if (entry?.experimentCompleted === true) {
    return 'Получилось';
  }
  if (entry?.experimentCompleted === false) {
    return 'Не получилось';
  }
  return 'Без отметки';
}
</script>

<template>
  <SurfaceCard kind="dashboard">
    <SectionHeading>
      <div>
        <EyebrowText>Личные проверки</EyebrowText>
        <h2>Эксперименты в эту неделю</h2>
      </div>
      <CountBadge>{{ experiments.length }}</CountBadge>
    </SectionHeading>
    <div class="weekly-experiments__content">
      <details
        v-for="(experiment, index) in experiments"
        :key="experiment.id"
        class="experiment-period-card"
        :open="openExperimentId === experiment.id"
        @toggle="handleExperimentToggle($event, experiment.id)"
      >
        <summary>
          <span class="experiment-period-card__heading">
            <span
              ><EyebrowText>{{ experiment.statusLabel }}</EyebrowText
              ><strong>{{ experiment.titlePreview }}</strong
              ><EyebrowText>Период: {{ experiment.periodLabel }}</EyebrowText></span
            >
            <CountBadge v-if="experiment.notes.length" :aria-label="`Заметок: ${experiment.notes.length}`">
              {{ experiment.notes.length }}
            </CountBadge>
          </span>
          <span class="experiment-period-card__breakdown" aria-label="Отметки эксперимента за эту неделю">
            <span>За неделю: получилось · {{ experiment.completedDays }}</span>
            <span>Не получилось · {{ experiment.notCompletedDays }}</span>
            <span>Без отметки · {{ experiment.unmarkedDays }} из {{ experiment.plannedDays }}</span>
          </span>
        </summary>
        <div class="experiment-period-card__details">
          <div class="weekly-experiment-plan">
            <EyebrowText>Условие</EyebrowText>
            <p>
              <strong>{{ experiment.title }}</strong>
            </p>
            <p v-if="experiment.hypothesis">Что хотите узнать: {{ experiment.hypothesis }}</p>
            <p v-if="experiment.conclusion">
              <strong>{{ experiment.active ? 'Промежуточное наблюдение:' : 'Что заметили:' }}</strong
              ><br />{{ experiment.conclusion }}
            </p>
            <p v-if="experiment.decision">Дальше: {{ experimentDecisionLabel(experiment.decision).toLocaleLowerCase('ru-RU') }}</p>
            <p v-if="experiment.totalPlannedDays !== experiment.plannedDays">
              За весь период: получилось {{ experiment.totalCompletedDays }}, не получилось {{ experiment.totalNotCompletedDays }}, без
              отметки {{ experiment.totalUnmarkedDays }} из {{ experiment.totalPlannedDays }}.
            </p>
          </div>
          <ActionButton
            v-if="experiment.notes.length"
            variant="secondary"
            type="button"
            :aria-expanded="openExperimentNotesId === experiment.id"
            :aria-controls="`experiment-notes-${index}`"
            @click="toggleExperimentNotes(experiment.id)"
          >
            {{ openExperimentNotesId === experiment.id ? 'Скрыть заметки' : `Заметки этой недели · ${experiment.notes.length}` }}
          </ActionButton>
          <FormHint v-else>Заметок за эту неделю нет.</FormHint>
          <div
            v-if="openExperimentNotesId === experiment.id && visibleExperimentNote(experiment)"
            :id="`experiment-notes-${index}`"
            class="experiment-period-card__details experiment-note-page"
          >
            <article class="experiment-note-item">
              <time>{{ formatDate(visibleExperimentNote(experiment)!.date, { weekday: 'short', day: 'numeric' }) }}</time>
              <p>
                <strong>{{ experimentNoteStatus(experiment) }}</strong
                ><br />{{ visibleExperimentNote(experiment)!.experimentNote }}
              </p>
            </article>
            <ArchivePagination
              :page="experimentNotePage(experiment.id)"
              :page-count="experiment.notes.length"
              context-label="заметок эксперимента"
              @update:page="experimentNotePages[experiment.id] = $event"
            />
          </div>
        </div>
      </details>
    </div>
  </SurfaceCard>
</template>

<style scoped>
.weekly-experiments__content {
  display: grid;
  gap: 12px;
  padding-bottom: 16px;
}
.experiment-period-card {
  min-width: 0;
  padding: 0;
  overflow: hidden;
  border: 1px solid var(--month-insight-border);
  border-radius: 17px;
  background: linear-gradient(135deg, var(--weekly-rhythm-item-surface), var(--month-insight-gradient));
}
.experiment-period-card > summary {
  display: grid;
  gap: 11px;
  padding: 17px;
  cursor: pointer;
  list-style: none;
}
.experiment-period-card > summary::-webkit-details-marker {
  display: none;
}
.experiment-period-card[open] > summary {
  border-bottom: 1px solid var(--month-insight-border);
  background: var(--surface);
}
.experiment-period-card__heading {
  display: flex;
  min-width: 0;
  justify-content: space-between;
  align-items: flex-start;
  gap: 14px;
}
.experiment-period-card__heading strong {
  display: block;
  margin: 0;
  color: var(--navy);
  font-size: 18px;
  line-height: 1.2;
}
.experiment-period-card__heading .eyebrow {
  margin-bottom: 5px;
}
.experiment-period-card__breakdown {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 12px;
}
.experiment-period-card__breakdown span {
  padding: 5px 8px;
  border-radius: 999px;
  background: var(--month-insight-pill-surface);
  color: var(--month-insight-pill-text);
  font-size: 11px;
  font-weight: 750;
}
.experiment-period-card__details {
  padding: 16px 17px;
  background: var(--month-insight-panel-surface);
}
.experiment-note-page {
  margin-top: 12px;
}
.experiment-note-item {
  display: grid;
  grid-template-columns: 86px 1fr;
  gap: 12px;
  align-items: start;
  padding: 12px 14px;
  border: 1px solid var(--month-chart-border);
  border-radius: 14px;
  background: var(--month-chart-surface);
}
.experiment-note-item time {
  color: var(--month-chart-text);
  font-size: 12px;
  font-weight: 800;
  text-transform: capitalize;
}
.experiment-note-item p {
  margin: 0;
  color: var(--month-chart-title);
  font-size: 13px;
  line-height: 1.45;
}
.weekly-experiment-plan {
  margin-bottom: 10px;
  padding: 12px 14px;
  border: 1px solid var(--week-data-border);
  border-radius: 12px;
  background: var(--week-data-surface);
}
.weekly-experiment-plan p {
  margin: 5px 0 0;
  color: var(--week-data-text);
  font-size: 13px;
  line-height: 1.45;
}
@media (max-width: 720px) {
  .experiment-note-item {
    grid-template-columns: 76px 1fr;
  }
  .experiment-period-card > summary,
  .experiment-period-card__details {
    padding-right: 13px;
    padding-left: 13px;
  }
  .experiment-period-card__heading {
    gap: 10px;
  }
  .experiment-period-card__heading strong {
    font-size: 16px;
  }
}
</style>
