<script setup lang="ts">
import PeriodReviewActions from '@/features/reviews/ui/PeriodReviewActions.vue';
import ActionButton from '@/shared/ui/actions/ActionButton.vue';
import SurfaceCard from '@/shared/ui/layout/SurfaceCard.vue';
import SectionHeading from '@/shared/ui/layout/SectionHeading.vue';
import { computed, ref, watch } from 'vue';
import { RouterLink as Link } from 'vue-router';
import WeeklyExperimentCards from '../features/experiments/ui/WeeklyExperimentCards.vue';
import { buildWeeklyExperimentCards } from '../features/experiments/weeklyReview';
import PeriodAnalysisCard from '../features/reviews/ui/PeriodAnalysisCard.vue';
import PeriodDetails from '../features/reviews/ui/PeriodDetails.vue';
import PeriodRecordCard from '../features/reviews/ui/PeriodRecordCard.vue';
import Pill from '../features/reviews/ui/PeriodPill.vue';
import ReviewHeading from '../features/reviews/ui/ReviewPageHeading.vue';
import ReviewNotice from '../features/reviews/ui/ReviewNotice.vue';
import WeeklyReviewJournalLinks from '../features/reviews/ui/WeeklyReviewJournalLinks.vue';
import Insight from '@/features/reviews/ui/WeeklyInsightCard.vue';
import WeeklyReviewOverview from '../features/reviews/ui/WeeklyReviewOverview.vue';
import WeeklyRhythmCard from '../features/reviews/ui/WeeklyRhythmCard.vue';
import DecisionFollowUp from '../features/reviews/ui/DecisionFollowUp.vue';
import { buildDecisionFollowUp } from '../features/reviews/decisionFollowUp';
import { usePeriodReview } from '../features/reviews/usePeriodReview';
import AutoGrowTextarea from '../shared/ui/forms/AutoGrowTextarea.vue';
import FormFieldLabel from '../shared/ui/forms/FormFieldLabel.vue';
import PeriodNavigator from '../shared/ui/navigation/PeriodNavigator.vue';
import Badge from '../shared/ui/data-display/CountBadge.vue';
import PageShell from '../shared/ui/layout/PageShell.vue';
import PeriodEmptyGuide from '../shared/ui/content/PeriodEmptyGuide.vue';
import EyebrowText from '../shared/ui/typography/EyebrowText.vue';
import {
  actionDirectionLabel,
  buildReviewCues,
  contextFactorLabel,
  entriesForWeek,
  hasArea,
  resultsForPeriod,
  specialDayLabel,
  summarize,
  weekSummaryText,
} from '../features/analytics';
import { addDays, endOfWeek, formatDate, fromDateKey, startOfWeek, todayKey, toDateKey } from '../services/dates';
import { useAppStore } from '../stores/app';
import {
  contextFactorOptions,
  emptyWeeklyReview,
  externalCareerIdsForOptions,
  lifeAreaOptions,
  lifeEventTypeOptions,
  resultAreaOptions,
  type WeeklyReview,
} from '../types';

const props = defineProps<{ initialWeek?: string }>();
const store = useAppStore();

function validAnchor(value: string | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return todayKey();
  }
  return toDateKey(fromDateKey(value)) === value ? value : todayKey();
}

function initialAnchor(value: string | undefined) {
  return value ? validAnchor(value) : todayKey();
}

const anchor = ref(initialAnchor(props.initialWeek));
const start = computed(() => startOfWeek(anchor.value));
const end = computed(() => endOfWeek(anchor.value));
const days = computed(() => Array.from({ length: 7 }, (_, index) => addDays(start.value, index)));
const entries = computed(() => entriesForWeek(store.dailyEntries, anchor.value));
const entriesByDate = computed(() => new Map(entries.value.map((entry) => [entry.date, entry])));
const lifeAreaItems = computed(() => [...lifeAreaOptions, ...store.settings.customLifeAreaOptions]);
const contextFactorItems = computed(() => [...contextFactorOptions, ...store.settings.customContextFactorOptions]);
const externalCareerIds = computed(() => externalCareerIdsForOptions(store.settings.customCareerOptions));
const summary = computed(() => summarize(entries.value, externalCareerIds.value));
const results = computed(() => resultsForPeriod(store.results, start.value, end.value));
const lifeEvents = computed(() =>
  store.lifeEvents.filter((event) => event.date >= start.value && event.date <= end.value).sort((a, b) => b.date.localeCompare(a.date)),
);
const resultAreaItems = computed(() => [...resultAreaOptions, ...store.settings.customLifeAreaOptions]);
const resultAreaSummary = computed(() => {
  const knownAreas = resultAreaItems.value;
  const unknownAreas = [...new Set(results.value.map((result) => result.area))]
    .filter((area) => !knownAreas.some((option) => option.id === area))
    .map((area) => ({ id: area, label: area, icon: '·' }));

  return [...knownAreas, ...unknownAreas]
    .map((option) => ({ ...option, count: results.value.filter((result) => result.area === option.id).length }))
    .filter((option) => option.count > 0);
});
const eventTypeSummary = computed(() =>
  lifeEventTypeOptions
    .map((option) => ({ ...option, count: lifeEvents.value.filter((event) => event.type === option.id).length }))
    .filter((option) => option.count > 0),
);
const resultRecordItems = computed(() =>
  results.value.map((result) => ({
    id: result.id ?? result.createdAt,
    icon: resultAreaItems.value.find((option) => option.id === result.area)?.icon ?? '·',
    title: result.title,
    dateLabel: formatDate(result.date, { weekday: 'short', day: 'numeric' }),
  })),
);
const eventRecordItems = computed(() =>
  lifeEvents.value.map((event) => ({
    id: event.id ?? event.createdAt,
    icon: lifeEventTypeOptions.find((option) => option.id === event.type)?.icon ?? '·',
    title: event.title,
    dateLabel: formatDate(event.date, { weekday: 'short', day: 'numeric' }),
  })),
);
const experimentCards = computed(() =>
  buildWeeklyExperimentCards({
    start: start.value,
    end: end.value,
    weekEntries: entries.value,
    allEntries: store.dailyEntries,
    activeExperiment: store.settings.experiment,
    experimentHistory: store.settings.experimentHistory,
  }),
);
const reviewCues = computed(() =>
  buildReviewCues('week', entries.value, results.value, lifeEvents.value, externalCareerIds.value, contextFactorItems.value),
);
const primaryReviewCues = computed(() => reviewCues.value.slice(0, 3));
const {
  copyPrompt,
  downloadJson,
  hasSavedReview,
  promptCopying,
  review,
  reviewAvailable,
  reviewContextOpen,
  reviewHasContext,
  actions,
  savedReview,
  updateReviewContextOpen,
} = usePeriodReview<WeeklyReview>({
  period: 'week',
  anchor,
  start,
  end,
  emptyReview: emptyWeeklyReview,
  findReview: (weekStart) => store.reviewByWeek(weekStart),
  persistReview: (draft, expected) => store.saveReview(draft, expected),
  hasContext: (draft) =>
    draft.results.some((value) => value.trim()) ||
    draft.highlights.some((value) => value.trim()) ||
    Boolean(draft.stateContext.trim() || draft.support.trim() || draft.obstacle.trim()),
  prepareDraft: (draft) => {
    while (draft.results.length < 3) {
      draft.results.push('');
    }
    while (draft.highlights.length < 3) {
      draft.highlights.push('');
    }
  },
});
const previousReview = computed(() => store.reviewByWeek(addDays(start.value, -7)));
const decisionFollowUp = computed(() =>
  buildDecisionFollowUp(previousReview.value, savedReview.value, entries.value, results.value, lifeEvents.value),
);
const recoveredReview = computed(() => {
  const weekStart = store.settings.firstUse.weekStart;
  if (store.settings.firstUse.status !== 'completed' || !weekStart || weekStart === start.value || !store.settings.firstUse.overviewSeen) {
    return null;
  }
  return store.reviewByWeek(weekStart) ?? null;
});
const recoveredWeekEnd = computed(() =>
  recoveredReview.value ? recoveredReview.value.coveredThrough || addDays(recoveredReview.value.weekStart, 6) : '',
);
const isRecoveredReview = computed(
  () =>
    Boolean(savedReview.value) &&
    store.settings.firstUse.weekStart === start.value &&
    store.settings.firstUse.overviewSeen &&
    (store.settings.firstUse.status === 'in_progress' || store.settings.firstUse.status === 'completed'),
);
const showRecoveredOverview = computed(() => isRecoveredReview.value && window.location.hash === '#first-use-overview');
const navigatorSubtitle = computed(() => {
  if (showRecoveredOverview.value) {
    return 'Ваш первый обзор недели';
  }
  return start.value === startOfWeek(todayKey()) ? 'Текущая неделя' : '';
});
const recoveredPeriodIsIncomplete = computed(
  () => Boolean(savedReview.value?.coveredThrough) && savedReview.value!.coveredThrough < addDays(savedReview.value!.weekStart, 6),
);
const hasDailyData = computed(() => summary.value.coveredEntriesCount > 0);
const hasJournalData = computed(() => results.value.length > 0 || lifeEvents.value.length > 0);
const hasPeriodData = computed(
  () => hasDailyData.value || hasJournalData.value || hasSavedReview.value || experimentCards.value.length > 0,
);
const rows = computed(() => [
  { id: 'career', label: 'Работа', icon: '↗' },
  { id: 'sport', label: 'Спорт', icon: '△' },
  ...lifeAreaItems.value.filter((option) => store.settings.activeLifeAreas.includes(option.id)),
]);
const summaryText = computed(() => weekSummaryText(summary.value, store.settings.activeLifeAreas, lifeAreaItems.value));
const contextNotes = computed(() =>
  entries.value.filter((entry) => entry.contextFactors.length || entry.contextNote.trim()).sort((a, b) => a.date.localeCompare(b.date)),
);
const actionNotes = computed(() =>
  entries.value.filter((entry) => entry.actionDirection !== null).sort((a, b) => a.date.localeCompare(b.date)),
);
const specialDays = computed(() => entries.value.filter((entry) => entry.specialDay !== null).sort((a, b) => a.date.localeCompare(b.date)));
const rhythmDays = computed(() => days.value.map((day) => ({ day, entry: entriesByDate.value.get(day) })));
watch(
  () => props.initialWeek,
  (value) => {
    anchor.value = initialAnchor(value);
  },
);
</script>

<template>
  <PageShell class="page--review page--week">
    <ReviewHeading
      title="Неделя"
      summary="Вспомните события недели, посмотрите записи о сне, самочувствии и занятиях."
      :action="hasPeriodData ? (reviewAvailable ? 'К обзору' : 'Обзор позже') : undefined"
      href="#week-review"
      period="week"
    />
    <PeriodNavigator
      :title="`${formatDate(start, { day: 'numeric', month: 'short' })} — ${formatDate(end, { day: 'numeric', month: 'short' })}`"
      :subtitle="navigatorSubtitle"
      @previous="anchor = addDays(anchor, -7)"
      @next="anchor = addDays(anchor, 7)"
      @current="anchor = todayKey()"
    />

    <ReviewNotice v-if="recoveredReview && !hasSavedReview" tag="section" class="recovered-week-link">
      <div>
        <strong>Ваш первый обзор сохранён</strong>
        <p>
          Сейчас открыта другая неделя. Сохранённый обзор относится к
          {{ formatDate(recoveredReview.weekStart, { day: 'numeric', month: 'long' }) }} —
          {{ formatDate(recoveredWeekEnd, { day: 'numeric', month: 'long', year: 'numeric' }) }}.
        </p>
      </div>
      <ActionButton
        :as="Link"
        variant="secondary"
        class="context-action"
        :to="`/week?week=${recoveredReview.weekStart}#first-use-overview`"
      >
        Открыть обзор
      </ActionButton>
    </ReviewNotice>

    <PeriodEmptyGuide v-if="!hasPeriodData">
      <strong>За эту неделю пока нет записей</strong>
      <p>Заполняйте на главной несколько важных пунктов. Здесь они соберутся по дням и помогут сравнить сон, состояние и действия.</p>
      <ActionButton :as="Link" variant="secondary" to="/today">Перейти к записи за день</ActionButton>
    </PeriodEmptyGuide>

    <template v-else>
      <ReviewNotice v-if="!hasDailyData" tag="section" class="period-data-guide">
        <strong>{{ experimentCards.length ? 'Есть только отметки эксперимента' : 'За эту неделю нет дневных записей' }}</strong>
        <p>
          {{ experimentCards.length ? 'Отметки эксперимента показаны ниже.' : 'Итоги, события и сохранённый обзор показаны ниже.' }} Данных
          для сравнения сна, состояния и действий пока нет.
        </p>
      </ReviewNotice>

      <article v-if="showRecoveredOverview && savedReview" id="first-use-overview" class="restored-week-overview">
        <div class="restored-week-overview__heading">
          <div>
            <EyebrowText tag="p">По вашим воспоминаниям</EyebrowText>
            <h2>Ваш обзор недели</h2>
            <p>Здесь ваши ответы о событиях, делах и самочувствии за неделю.</p>
            <p v-if="recoveredPeriodIsIncomplete" class="restored-week-overview__coverage">
              Ответы собраны по {{ formatDate(savedReview.coveredThrough, { day: 'numeric', month: 'long' }) }}. Остальные дни этой недели
              не считаются пропущенными.
            </p>
          </div>
        </div>
        <WeeklyReviewOverview :review="savedReview" />
        <WeeklyReviewJournalLinks :review="savedReview" />
        <div class="restored-week-overview__actions">
          <ActionButton :as="Link" variant="primary" to="/today">Записать сегодняшний день</ActionButton>
          <ActionButton :as="Link" variant="secondary" to="/today?first-use=edit">Исправить ответы</ActionButton>
        </div>
      </article>

      <PeriodDetails v-if="hasDailyData" title="Сводка записей недели"
        ><Insight>{{ summaryText }}</Insight></PeriodDetails
      >

      <section
        v-if="results.length || lifeEvents.length"
        class="period-records period-records--featured"
        aria-label="Главные записи недели"
      >
        <PeriodRecordCard
          v-if="results.length"
          eyebrow="Сделанные дела"
          title="Итоги недели"
          :items="resultRecordItems"
          :breakdown="resultAreaSummary"
          breakdown-label="Итоги по областям"
          pagination-label="итогов недели"
        />

        <PeriodRecordCard
          v-if="lifeEvents.length"
          eyebrow="Из журнала"
          title="События недели"
          :items="eventRecordItems"
          :breakdown="eventTypeSummary"
          breakdown-label="События по типам"
          pagination-label="событий недели"
        />
      </section>

      <PeriodAnalysisCard
        v-if="hasDailyData || hasJournalData"
        content="cues"
        title="На что обратить внимание"
        :cues="primaryReviewCues"
        :copying="promptCopying"
        @copy="copyPrompt"
        @download="downloadJson"
      />

      <DecisionFollowUp v-if="decisionFollowUp" :follow-up="decisionFollowUp" />

      <PeriodDetails
        v-if="hasDailyData || hasJournalData || experimentCards.length"
        class="week-data-details"
        :title="hasDailyData ? 'Показать записи по дням' : 'Записи недели'"
        :open="!hasDailyData"
      >
        <WeeklyRhythmCard v-if="hasDailyData" :days="rhythmDays" />

        <WeeklyExperimentCards v-if="experimentCards.length" :experiments="experimentCards" />

        <SurfaceCard v-if="hasDailyData && actionNotes.length" kind="dashboard">
          <SectionHeading>
            <div>
              <EyebrowText>Действия по цели</EyebrowText>
              <h2>Конкретные действия и подготовка</h2>
            </div>
            <Badge>{{ actionNotes.length }}</Badge>
          </SectionHeading>
          <div class="note-list">
            <article v-for="entry in actionNotes" :key="entry.date" class="note-item">
              <time>{{ formatDate(entry.date, { weekday: 'short', day: 'numeric' }) }}</time>
              <p>
                <strong>{{ actionDirectionLabel(entry.actionDirection) }}</strong
                ><span v-if="entry.focusTitle"><br />Цель: {{ entry.focusTitle }}</span
                ><span v-if="entry.actionNote"><br />{{ entry.actionNote }}</span>
              </p>
            </article>
          </div>
        </SurfaceCard>

        <SurfaceCard v-if="hasDailyData && specialDays.length" kind="dashboard">
          <SectionHeading>
            <div>
              <h2>Особые дни</h2>
            </div>
            <Badge>{{ specialDays.length }}</Badge>
          </SectionHeading>
          <div class="special-day-list">
            <article v-for="entry in specialDays" :key="entry.date" class="special-day-item">
              <time>{{ formatDate(entry.date, { weekday: 'short', day: 'numeric' }) }}</time>
              <strong>{{ specialDayLabel(entry.specialDay) }}</strong>
              <p v-if="entry.specialDayNote">{{ entry.specialDayNote }}</p>
            </article>
          </div>
        </SurfaceCard>

        <SurfaceCard v-if="hasDailyData && contextNotes.length" kind="dashboard">
          <SectionHeading>
            <div>
              <EyebrowText>Условия дня</EyebrowText>
              <h2>Повторяющиеся условия и заметки</h2>
            </div>
            <Badge>{{ contextNotes.length }}</Badge>
          </SectionHeading>
          <div class="factor-note-list">
            <article v-for="entry in contextNotes" :key="entry.date" class="factor-note-item">
              <time>{{ formatDate(entry.date, { weekday: 'short', day: 'numeric' }) }}</time>
              <div>
                <span v-for="factor in entry.contextFactors" :key="factor" class="mini-pill">{{
                  contextFactorLabel(factor, contextFactorItems)
                }}</span>
                <p v-if="entry.contextNote">{{ entry.contextNote }}</p>
              </div>
            </article>
          </div>
        </SurfaceCard>

        <SurfaceCard v-if="hasDailyData" kind="dashboard">
          <SectionHeading>
            <div>
              <EyebrowText>Каким сферам жизни вы уделяли внимание</EyebrowText>
              <h2>Карта недели</h2>
            </div>
          </SectionHeading>
          <div class="heatmap" :style="{ '--day-count': days.length }">
            <div class="heatmap__corner"></div>
            <div v-for="day in days" :key="day" class="heatmap__day">
              <strong>{{ formatDate(day, { weekday: 'short' }) }}</strong
              ><small>{{ formatDate(day, { day: '2-digit' }) }}</small>
            </div>
            <template v-for="row in rows" :key="row.id">
              <div class="heatmap__label">
                <span>{{ row.icon }}</span
                >{{ row.label }}
              </div>
              <div
                v-for="day in days"
                :key="`${row.id}-${day}`"
                class="heatmap__cell"
                :class="{ active: hasArea(entriesByDate.get(day), row.id) }"
              >
                <span></span>
              </div>
            </template>
          </div>
        </SurfaceCard>
      </PeriodDetails>

      <SurfaceCard v-if="reviewAvailable" id="week-review" kind="review">
        <SectionHeading>
          <div>
            <EyebrowText>Обзор недели</EyebrowText>
            <h2>Короткий обзор</h2>
          </div>
          <Pill>До {{ formatDate(end, { day: 'numeric', month: 'long', year: 'numeric' }) }}</Pill>
        </SectionHeading>
        <template v-if="previousReview?.nextLever || previousReview?.ifThenPlan">
          <div class="previous-plan">
            <EyebrowText>Решение из прошлого обзора</EyebrowText>
            <p v-if="previousReview.nextLever"><strong>Вы решили:</strong> {{ previousReview.nextLever }}</p>
            <p v-if="previousReview.ifThenPlan"><strong>План:</strong> {{ previousReview.ifThenPlan }}</p>
          </div>
          <FormFieldLabel>Что получилось с этим решением?</FormFieldLabel
          ><AutoGrowTextarea
            v-model="review.previousPlanOutcome"
            :rows="2"
            placeholder="Сработало, не сработало или данных пока недостаточно — и почему"
          />
        </template>
        <PeriodDetails
          class="review-context-details"
          :title="reviewHasContext ? 'Дела, события и самочувствие' : 'Добавить дела, события и самочувствие'"
          :open="reviewContextOpen"
          @toggle="updateReviewContextOpen"
        >
          <FormFieldLabel>До трёх итогов или сделанных дел</FormFieldLabel>
          <input
            v-for="(_, index) in review.results"
            :key="index"
            v-model="review.results[index]"
            type="text"
            :placeholder="`${index + 1}. Сделанное дело или результат`"
          />
          <FormFieldLabel>До трёх событий, решений или мыслей</FormFieldLabel>
          <input
            v-for="(_, index) in review.highlights"
            :key="`highlight-${index}`"
            v-model="review.highlights[index]"
            type="text"
            :placeholder="`${index + 1}. Что важно запомнить`"
          />
          <FormFieldLabel>Самочувствие и условия недели</FormFieldLabel>
          <AutoGrowTextarea v-model="review.stateContext" :rows="2" placeholder="Самочувствие и обстоятельства" />
          <FormFieldLabel>Что помогало?</FormFieldLabel
          ><AutoGrowTextarea v-model="review.support" :rows="2" placeholder="Например: режим или помощь близких" />
          <FormFieldLabel>Что мешало?</FormFieldLabel><AutoGrowTextarea v-model="review.obstacle" :rows="2" placeholder="Например: шум" />
        </PeriodDetails>
        <FormFieldLabel>Что продолжить или изменить на следующей неделе?</FormFieldLabel
        ><AutoGrowTextarea v-model="review.nextLever" :rows="2" placeholder="Можно продолжить как есть или пока ничего не решать" />
        <FormFieldLabel>План на похожую ситуацию</FormFieldLabel
        ><AutoGrowTextarea
          v-model="review.ifThenPlan"
          class="review-plan-field"
          :rows="2"
          placeholder="Например: если не могу начать, то выделю 10 минут на черновик"
        />
        <PeriodReviewActions :actions="actions" label="Сохранить обзор" />
      </SurfaceCard>
      <ReviewNotice v-else id="week-review" tag="section">
        <strong>Короткий обзор появится в конце недели</strong>
        <p>Обзор необязателен. Дневные записи сохранятся.</p>
      </ReviewNotice>

      <PeriodAnalysisCard
        v-if="hasDailyData || hasJournalData"
        section-id="ai-analysis"
        content="external"
        title="Внешний разбор недели"
        :cues="primaryReviewCues"
        :copying="promptCopying"
        @copy="copyPrompt"
        @download="downloadJson"
      />
    </template>
  </PageShell>
</template>

<style scoped src="./WeekView.css"></style>
