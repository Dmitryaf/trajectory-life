<script setup lang="ts">
import ActionButton from '@/shared/ui/actions/ActionButton.vue';
import { RouterLink } from 'vue-router';
import SurfaceCard from '@/shared/ui/layout/SurfaceCard.vue';
import DataNote from '@/shared/ui/content/DataNote.vue';
import { computed, ref } from 'vue';
import AiAnalysisNudge from '../features/analysis/ui/AiAnalysisNudge.vue';
import CurrentGoalDialog from '../features/daily-entry/ui/CurrentGoalDialog.vue';
import { resolveTodayContextCue } from '../features/daily-entry/contextCue';
import DailyLayoutSettings from '../features/daily-entry/ui/DailyLayoutSettings.vue';
import { useDailyBlocksDisclosure } from '../features/daily-entry/useDailyBlocksDisclosure';
import { useCurrentGoalDialog } from '../features/daily-entry/useCurrentGoalDialog';
import { useTodayContext } from '../features/daily-entry/useTodayContext';
import FirstUseRecovery from '../features/first-use/ui/FirstUseRecovery.vue';
import { isFirstUsePrimary } from '../features/first-use/priority';
import HowItWorksDialog from '../features/first-use/ui/HowItWorksDialog.vue';
import PwaInstallNudge from '../features/pwa/ui/PwaInstallNudge.vue';
import JournalQuickCapture from '../features/journal/ui/JournalQuickCapture.vue';
import AutoGrowTextarea from '../shared/ui/forms/AutoGrowTextarea.vue';
import FormCardHeading from '../shared/ui/forms/FormCardHeading.vue';
import UiIcon from '../shared/ui/icons/UiIcon.vue';
import FormFieldLabel from '../shared/ui/forms/FormFieldLabel.vue';
import FormDisclosure from '../shared/ui/forms/FormDisclosure.vue';
import FormHint from '../shared/ui/forms/FormHint.vue';
import FormRow from '../shared/ui/forms/FormRow.vue';
import DateInput from '../shared/ui/forms/DateInput.vue';
import PageHeading from '../shared/ui/layout/PageHeading.vue';
import PageShell from '../shared/ui/layout/PageShell.vue';
import ReviewNudge from '../shared/ui/content/ReviewNudge.vue';
import EyebrowText from '../shared/ui/typography/EyebrowText.vue';
import ChipGroup from '../shared/ui/forms/ChipGroup.vue';
import DurationInput from '../shared/ui/forms/DurationInput.vue';
import ScalePicker from '../shared/ui/forms/ScalePicker.vue';
import { experimentTextLimits } from '../features/experiments/model';
import { useDailyEntryForm } from '../features/daily-entry/useDailyEntryForm';
import { useAppStore } from '../stores/app';
import { notifyUnknownError } from '../services/notifications';
import { formatDate, formatMinutes, todayKey } from '../services/dates';
import { buildObservations } from '../features/analytics';
import {
  actionDirectionEntryOptions,
  activityOptions,
  careerOptions,
  experimentAppliesToDate,
  contextFactorOptions,
  legacyContextFactorOptions,
  legacyActivityOptions,
  legacyCareerOptions,
  lifeAreaOptions,
  nutritionOptions,
  specialDayOptions,
  type ActionDirectionId,
  type ActivityId,
  type CareerState,
  type DailyEntry,
  type DailyRecordedFieldId,
  type LifeAreaId,
  type NutritionState,
} from '../types';

const store = useAppStore();
const entryDateInput = ref<InstanceType<typeof DateInput>>();
const firstUsePromptHidden = ref(false);
const pwaNudgeAvailable = ref(false);
const { goalDialogOpen, goalSaving, openCurrentGoalDialog, closeCurrentGoalDialog, saveCurrentGoal, removeCurrentGoal } =
  useCurrentGoalDialog(store);
const {
  selectedDate,
  sleepDurationMinutes,
  timeInBedDurationMinutes,
  weightKg,
  validationMessage,
  form,
  hasSavedEntry,
  isDirty,
  entryChangeNotice,
  draftConflict,
  saveButtonText,
  saveButtonDisabled,
  blockIsActive,
  changeSelectedDate,
  selectDate,
  resolveDraftConflict,
  save,
} = useDailyEntryForm(store);
const { additionalBlocksOpen, syncAdditionalBlocksOpen } = useDailyBlocksDisclosure(validationMessage);

const selectedDateLabel = computed(() => selectedDate.value.split('-').reverse().join('.'));

const careerItems = computed(() => {
  const usedIds = new Set([
    ...store.dailyEntries.flatMap((entry) => entry.careerStates),
    ...store.dailyEntries.flatMap((entry) => (entry.careerState ? [entry.careerState] : [])),
    ...form.careerStates,
  ]);
  return Array.from(
    new Map(
      [
        ...careerOptions,
        ...store.settings.customCareerOptions.filter((option) => !option.archived || form.careerStates.includes(option.id)),
        ...legacyCareerOptions.filter((option) => usedIds.has(option.id)),
      ].map((option) => [option.id, option]),
    ).values(),
  );
});
const activityItems = computed(() => {
  const configured = [
    ...activityOptions.filter((option) => !store.settings.hiddenActivityIds.includes(option.id)),
    ...store.settings.customActivityOptions.filter((option) => !option.archived),
  ];
  const configuredIds = new Set(configured.map((option) => option.id));
  const historical = Array.from(
    new Map(
      [...activityOptions, ...legacyActivityOptions, ...store.settings.customActivityOptions].map((option) => [option.id, option]),
    ).values(),
  ).filter((option) => form.activities.includes(option.id) && !configuredIds.has(option.id));
  return [...configured, ...historical];
});
const contextFactorItems = computed(() => {
  const configured = [
    ...contextFactorOptions.filter((option) => !store.settings.hiddenContextFactorIds.includes(option.id)),
    ...store.settings.customContextFactorOptions.filter((option) => !option.archived),
  ];
  const configuredIds = new Set(configured.map((option) => option.id));
  const historical = Array.from(
    new Map(
      [...contextFactorOptions, ...legacyContextFactorOptions, ...store.settings.customContextFactorOptions].map((option) => [
        option.id,
        option,
      ]),
    ).values(),
  ).filter((option) => form.contextFactors.includes(option.id) && !configuredIds.has(option.id));
  return [...configured, ...historical];
});
const actionDirectionItems = computed(() =>
  form.actionDirection === 'recovery'
    ? [...actionDirectionEntryOptions, { id: 'recovery' as const, label: 'Восстановление (старая отметка)', icon: '◌' }]
    : actionDirectionEntryOptions,
);
const lifeAreaItems = computed(() => [...lifeAreaOptions, ...store.settings.customLifeAreaOptions]);
const activeLifeOptions = computed(() => lifeAreaItems.value.filter((option) => store.settings.activeLifeAreas.includes(option.id)));
const dailyLifeAreaItems = computed(() => [
  ...activeLifeOptions.value,
  ...lifeAreaItems.value.filter(
    (option) => form.lifeAreas.includes(option.id) && !activeLifeOptions.value.some((active) => active.id === option.id),
  ),
]);
const isToday = computed(() => selectedDate.value === todayKey());
const isFirstEntry = computed(() => store.loaded && store.dailyEntries.length === 0);
const firstUseEditRequested = new URL(window.location.href).searchParams.get('first-use') === 'edit';
const firstUseTakesPriority = computed(() => isToday.value && isFirstUsePrimary(store.settings.firstUse, firstUseEditRequested));
const displayedFocusTitle = computed(() => (hasSavedEntry.value ? form.focusTitle : form.focusTitle || store.settings.activeFocusTitle));
const displayedFocusOutcomeCriterion = computed(() =>
  hasSavedEntry.value ? form.focusOutcomeCriterion : form.focusOutcomeCriterion || store.settings.focusOutcomeCriterion,
);
const displayedFocusReviewDate = computed(() =>
  hasSavedEntry.value ? form.focusReviewDate : form.focusReviewDate || store.settings.focusReviewDate,
);
const displayedExternalEvidenceCriterion = computed(() =>
  hasSavedEntry.value ? form.externalEvidenceCriterion : form.externalEvidenceCriterion || store.settings.externalEvidenceCriterion,
);
const displayedNutritionCriterion = computed(() =>
  hasSavedEntry.value ? form.nutritionCriterion : form.nutritionCriterion || store.settings.nutritionGoalCriterion,
);
const hasSelectedFocus = computed(() => Boolean(displayedFocusTitle.value.trim()));
const hasRecordedGoalAction = computed(() => form.recordedFields.includes('actionDirection'));
const showGoalActionChoices = computed(() => hasSelectedFocus.value || hasRecordedGoalAction.value);
const showLifeAreas = computed(() => activeLifeOptions.value.length > 0 || form.lifeAreas.length > 0 || form.lifeAreasRecorded);
const {
  activeReviewReminder,
  currentWeekEntries,
  currentWeeklyPlan,
  currentWeekSummary,
  showAiAnalysisNudge,
  yesterday,
  yesterdayMissing,
} = useTodayContext(store, isToday);
const currentWeekObservation = computed(() => buildObservations(currentWeekEntries.value, contextFactorItems.value)[0]);
const experimentAppliesToSelectedDate = computed(() => {
  return experimentAppliesToDate(store.settings.experiment, selectedDate.value);
});
const experimentPeriodLabel = computed(
  () =>
    `${formatDate(store.settings.experiment.startDate, { day: 'numeric', month: 'long' })} — ${formatDate(
      store.settings.experiment.endDate,
      { day: 'numeric', month: 'long', year: 'numeric' },
    )}`,
);
const hasAdditionalDayBlocks = computed(
  () =>
    blockIsActive('career') ||
    blockIsActive('movement') ||
    blockIsActive('nutrition') ||
    showLifeAreas.value ||
    experimentAppliesToSelectedDate.value,
);
const activeContextCue = computed(() =>
  resolveTodayContextCue({
    firstUse:
      isToday.value && store.settings.firstUse.status === 'available' && store.dailyEntries.length > 0 && !firstUsePromptHidden.value,
    review: Boolean(activeReviewReminder.value),
    recovery: yesterdayMissing.value,
    plan: isToday.value && Boolean(currentWeeklyPlan.value),
    pwa: isToday.value && pwaNudgeAvailable.value,
    ai: showAiAnalysisNudge.value,
    pulse: isToday.value && currentWeekSummary.value.coveredEntriesCount > 0,
  }),
);

async function dismissAiAnalysisNudge() {
  try {
    await store.saveSettings({ ...store.settings, aiAnalysisNudgeDismissed: true });
  } catch (error) {
    notifyUnknownError(error, 'Не удалось скрыть подсказку');
  }
}

function fillYesterday() {
  changeSelectedDate(yesterday.value);
}

function setContextFactors(value: string | string[] | null) {
  form.contextFactors = Array.isArray(value) ? (value as DailyEntry['contextFactors']) : [];
  form.contextFactorsRecorded = true;
  markRecorded('contextFactors');
}

function setActivities(value: string | string[] | null) {
  form.activities = Array.isArray(value) ? (value as ActivityId[]) : [];
  form.activitiesRecorded = true;
  markRecorded('activities');
}

function setLifeAreas(value: string | string[] | null) {
  form.lifeAreas = Array.isArray(value) ? (value as LifeAreaId[]) : [];
  form.lifeAreasRecorded = true;
  markRecorded('lifeAreas');
}

function setCareerStates(value: string | string[] | null) {
  form.careerStates = Array.isArray(value) ? (value as CareerState[]) : [];
  form.careerState = form.careerStates[0] ?? null;
  markRecorded('careerStates');
}

function setActionDirection(value: string | string[] | null) {
  form.actionDirection = typeof value === 'string' ? (value as ActionDirectionId) : null;
  if (form.actionDirection) {
    markRecorded('actionDirection');
  } else {
    unmarkRecorded('actionDirection');
  }
}

function setNoActionDirection() {
  form.actionDirection = null;
  form.actionNote = '';
  markRecorded('actionDirection');
}

function setNutritionState(value: string | string[] | null) {
  form.nutritionState = typeof value === 'string' ? (value as NutritionState) : null;
  if (form.nutritionState) {
    markRecorded('nutritionState');
  } else {
    unmarkRecorded('nutritionState');
  }
}

function markRecorded(field: DailyRecordedFieldId) {
  if (!form.recordedFields.includes(field)) {
    form.recordedFields.push(field);
  }
}

function unmarkRecorded(field: DailyRecordedFieldId) {
  form.recordedFields = form.recordedFields.filter((item) => item !== field);
}

function openEntryDatePicker() {
  const input = entryDateInput.value?.element;
  if (!input) {
    return;
  }
  if (typeof input.showPicker === 'function') {
    input.showPicker();
  } else {
    input.click();
  }
}
</script>

<template>
  <PageShell class="page--today">
    <PageHeading>
      <div>
        <EyebrowText>Ежедневная запись</EyebrowText>
        <h1>{{ isToday ? 'Сегодня' : formatDate(selectedDate, { day: 'numeric', month: 'long', weekday: 'long' }) }}</h1>
      </div>
      <div class="entry-date-picker">
        <span class="entry-date-picker__label">Запись за дату</span>
        <span class="entry-date-control">
          <button class="entry-date-control__trigger" type="button" aria-label="Выбрать дату записи" @click="openEntryDatePicker">
            <span aria-hidden="true">{{ selectedDateLabel }}</span>
            <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8">
              <path d="M7 3v3M17 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z" />
            </svg>
          </button>
          <DateInput
            ref="entryDateInput"
            :display-value="selectedDate"
            :max="todayKey()"
            tabindex="-1"
            aria-hidden="true"
            aria-label="Дата записи"
            @click.stop
            @change="selectDate"
          />
        </span>
        <small>Можно выбрать любой прошедший день</small>
      </div>
    </PageHeading>

    <FirstUseRecovery
      v-if="isToday"
      :show-available-prompt="activeContextCue === 'first-use'"
      @available-hidden="firstUsePromptHidden = true"
    />

    <section v-if="isFirstEntry && !firstUseTakesPriority" class="first-entry-guide" aria-label="Первая запись">
      <div>
        <EyebrowText>С чего начать</EyebrowText>
        <h2>Отметьте несколько деталей сегодняшнего дня</h2>
        <p>Не нужно заполнять всё. Разделы на главной можно добавить или убрать в настройках — уже сохранённые записи не пропадут.</p>
      </div>
      <div class="first-entry-guide__actions">
        <ActionButton :as="RouterLink" variant="secondary" class="context-action" to="/settings#daily-blocks">Настроить блоки</ActionButton>
        <HowItWorksDialog button-label="Зачем это заполнять?" inline />
      </div>
    </section>

    <section v-if="!firstUseTakesPriority && draftConflict" class="entry-change-notice draft-conflict-notice" role="alert">
      <div>
        <strong>Черновик и сохранённая запись отличаются</strong>
        <p>Выберите локальный черновик или другую сохранённую версию. До выбора запись нельзя сохранить.</p>
      </div>
      <div class="goal-dialog__actions">
        <ActionButton variant="secondary" type="button" @click="resolveDraftConflict(false)">Оставить сохранённую</ActionButton>
        <ActionButton variant="primary" type="button" @click="resolveDraftConflict(true)">Продолжить с черновиком</ActionButton>
      </div>
    </section>

    <section v-else-if="!firstUseTakesPriority && entryChangeNotice" class="entry-change-notice" aria-live="polite">
      <div>
        <strong>{{ hasSavedEntry ? 'Изменения не сохранены' : 'Новая запись не сохранена' }}</strong>
        <p>{{ entryChangeNotice }}</p>
      </div>
    </section>

    <form v-if="!firstUseTakesPriority" class="checkin-grid" :class="{ 'checkin-grid--dirty': isDirty }" @submit.prevent="save">
      <SurfaceCard kind="form" class="form-card--daily-summary form-card--wide">
        <FormCardHeading icon="note">
          <div>
            <h2>Заметка дня</h2>
            <p v-if="isFirstEntry">Что сегодня произошло или что вы заметили — даже если день был обычным.</p>
          </div>
        </FormCardHeading>
        <textarea
          v-model="form.importantFact"
          aria-label="Заметка дня"
          rows="2"
          maxlength="240"
          placeholder="Например: после прогулки стало легче собраться с мыслями"
        ></textarea>
      </SurfaceCard>
      <div v-if="blockIsActive('sleep') || blockIsActive('context')" class="checkin-group-heading">
        <span>Состояние и условия</span>
      </div>
      <SurfaceCard v-if="blockIsActive('sleep')" id="sleep" kind="form" class="form-card--sleep form-card--wide">
        <FormCardHeading icon="sleep" tone="purple">
          <div>
            <h2>Сон и состояние</h2>
            <p v-if="isFirstEntry">Сон перед этой датой и сколько сил было в этот день.</p>
          </div>
          <RouterLink class="card-settings-link" to="/settings#daily-blocks">Настроить</RouterLink>
        </FormCardHeading>
        <FormHint>Время в кровати посчитается по времени отбоя и подъёма. «Примерно спал» — ваша оценка самого сна.</FormHint>
        <div class="sleep-field-grid">
          <div>
            <FormFieldLabel for="bedtime">Лёг спать</FormFieldLabel>
            <input id="bedtime" v-model="form.bedtime" type="time" />
          </div>
          <div>
            <FormFieldLabel for="wake-time">Встал</FormFieldLabel>
            <input id="wake-time" v-model="form.wakeTime" type="time" />
          </div>
          <div>
            <FormFieldLabel for="sleep-hours">Примерно спал</FormFieldLabel>
            <DurationInput id="sleep-hours" v-model="sleepDurationMinutes" :max-hours="16" />
          </div>
          <div>
            <FormFieldLabel for="time-in-bed-hours">В кровати</FormFieldLabel>
            <DurationInput id="time-in-bed-hours" v-model="timeInBedDurationMinutes" :max-hours="18" />
          </div>
        </div>
        <FormRow>
          <div class="form-control">
            <FormFieldLabel>Качество сна</FormFieldLabel><ScalePicker v-model="form.sleepQuality" low-label="плохо" high-label="хорошо" />
          </div>
          <div class="form-control">
            <FormFieldLabel>Энергия за день</FormFieldLabel><ScalePicker v-model="form.energy" low-label="нет сил" high-label="много сил" />
          </div>
        </FormRow>
        <p v-if="validationMessage" class="field-error" role="alert">{{ validationMessage }}</p>
      </SurfaceCard>

      <SurfaceCard v-if="blockIsActive('context')" id="day-conditions" kind="form" class="form-card--context form-card--wide">
        <FormCardHeading icon="context" tone="orange">
          <div>
            <h2>Что могло повлиять на день</h2>
            <p v-if="isFirstEntry">Отметьте условия, которые стоит сравнить с другими днями.</p>
          </div>
          <RouterLink class="card-settings-link" to="/settings#context-options">Настроить</RouterLink>
        </FormCardHeading>
        <div class="factor-block">
          <FormFieldLabel>Что сопровождало день?</FormFieldLabel>
          <ChipGroup :model-value="form.contextFactors" :options="contextFactorItems" multiple @update:model-value="setContextFactors" />
          <button
            class="none-option"
            :class="{ selected: form.contextFactorsRecorded && !form.contextFactors.length }"
            type="button"
            @click="setContextFactors([])"
          >
            Ничего из списка
          </button>
        </div>
        <FormFieldLabel for="context-note">Короткое пояснение</FormFieldLabel>
        <textarea
          id="context-note"
          v-model="form.contextNote"
          rows="3"
          maxlength="400"
          placeholder="Например: поздний кофе, тревога, шум, перегруз или частые пробуждения"
        ></textarea>
        <div class="context-special-day">
          <FormFieldLabel>Необычный день</FormFieldLabel>
          <FormHint>Эта отметка помогает не смешивать особые обстоятельства с обычными днями.</FormHint>
          <ChipGroup v-model="form.specialDay" :options="specialDayOptions" allow-clear />
          <template v-if="form.specialDay">
            <FormFieldLabel for="special-day-note">Короткое уточнение</FormFieldLabel>
            <input
              id="special-day-note"
              v-model="form.specialDayNote"
              type="text"
              maxlength="120"
              placeholder="Например: перелёт, простуда, дедлайн или семейное событие"
            />
          </template>
        </div>
      </SurfaceCard>

      <div class="checkin-group-heading">
        <span>Текущая цель</span>
      </div>
      <SurfaceCard
        id="goal-actions"
        kind="form"
        class="form-card--direction form-card--wide"
        :class="{ 'form-card--direction-empty': !showGoalActionChoices }"
        aria-label="Текущая цель"
      >
        <FormCardHeading icon="goal" tone="blue">
          <div>
            <h2>Шаг по текущей цели</h2>
            <p>
              {{
                hasSelectedFocus
                  ? `${hasSavedEntry ? 'Цель на эту дату' : 'Текущая цель'}: ${displayedFocusTitle}`
                  : hasRecordedGoalAction
                    ? 'Для этой записи цель не была сохранена.'
                    : hasSavedEntry
                      ? 'Для этой даты цель не была сохранена. Текущие настройки не изменяют историю.'
                      : 'Цель необязательна. Выберите её, если хотите связать дневные действия с периодом.'
              }}
            </p>
          </div>
          <button
            v-if="hasSelectedFocus && isToday"
            class="card-settings-link"
            type="button"
            aria-haspopup="dialog"
            @click="openCurrentGoalDialog"
          >
            {{ store.settings.activeFocusTitle.trim() ? 'Изменить' : 'Выбрать новую' }}
          </button>
        </FormCardHeading>
        <template v-if="showGoalActionChoices">
          <FormHint>Что лучше всего описывает этот день относительно выбранной цели?</FormHint>
          <ChipGroup
            :model-value="form.actionDirection"
            :options="actionDirectionItems"
            allow-clear
            @update:model-value="setActionDirection"
          />
          <button
            class="none-option"
            :class="{ selected: form.recordedFields.includes('actionDirection') && form.actionDirection === null }"
            type="button"
            @click="setNoActionDirection"
          >
            Шага по цели не было
          </button>
          <DataNote v-if="form.actionDirection === 'recovery'">
            Это значение сохранено из старой записи. Для новых дней восстановление отмечается в активности или условиях дня.
          </DataNote>
          <template v-if="form.actionDirection">
            <FormFieldLabel for="goal-action-note">Что именно произошло?</FormFieldLabel>
            <textarea
              id="goal-action-note"
              v-model="form.actionNote"
              rows="2"
              maxlength="180"
              placeholder="Коротко опишите одно действие или полученный результат"
            ></textarea>
          </template>
          <FormDisclosure
            v-if="displayedFocusOutcomeCriterion || displayedFocusReviewDate || displayedExternalEvidenceCriterion"
            class="analysis-range goal-context-details"
          >
            <template #summary>Показать критерии цели</template>
            <p v-if="displayedFocusOutcomeCriterion" class="form-context">
              Как понять, что получилось: {{ displayedFocusOutcomeCriterion }}
            </p>
            <p v-if="displayedFocusReviewDate" class="form-context">
              Проверить цель:
              {{ formatDate(displayedFocusReviewDate, { day: 'numeric', month: 'long', year: 'numeric' }) }}
            </p>
            <p v-if="displayedExternalEvidenceCriterion" class="form-context">
              Что считать шагом: {{ displayedExternalEvidenceCriterion }}
            </p>
          </FormDisclosure>
        </template>
        <div v-else-if="!hasSavedEntry" class="empty-block-note goal-empty-action">
          <ActionButton variant="secondary" class="context-action" type="button" aria-haspopup="dialog" @click="openCurrentGoalDialog">
            Выбрать цель
          </ActionButton>
        </div>
      </SurfaceCard>

      <details
        v-if="hasAdditionalDayBlocks"
        class="daily-additional-blocks"
        :open="additionalBlocksOpen"
        @toggle="syncAdditionalBlocksOpen"
      >
        <summary>
          <span>Дополнительные разделы</span>
          <small>Работа, движение, питание и другое — по вашим настройкам</small>
        </summary>
        <div class="daily-additional-blocks__grid">
          <SurfaceCard v-if="blockIsActive('career')" id="career" kind="form">
            <FormCardHeading icon="goal" tone="blue">
              <div>
                <h2>Рабочий контекст</h2>
                <p>Что было частью рабочего дня. Эта отметка сама по себе не считается шагом по текущей цели.</p>
              </div>
              <RouterLink class="card-settings-link" to="/settings#work-settings">Настроить</RouterLink>
            </FormCardHeading>
            <ChipGroup
              :model-value="form.careerStates as CareerState[]"
              :options="careerItems"
              multiple
              @update:model-value="setCareerStates"
            />
            <button
              class="none-option"
              :class="{ selected: form.recordedFields.includes('careerStates') && !form.careerStates.length }"
              type="button"
              @click="setCareerStates([])"
            >
              Ничего из списка
            </button>
            <DataNote>Конкретное действие по выбранной цели записывается только в блоке выше.</DataNote>
          </SurfaceCard>

          <SurfaceCard v-if="blockIsActive('movement')" id="movement" kind="form">
            <FormCardHeading icon="activity" tone="green">
              <div>
                <h2>Физическая активность</h2>
                <p v-if="isFirstEntry">Отметьте, была ли сегодня активность и какая.</p>
              </div>
              <RouterLink class="card-settings-link" to="/settings#movement-options">Настроить</RouterLink>
            </FormCardHeading>
            <ChipGroup
              :model-value="form.activities as ActivityId[]"
              :options="activityItems"
              multiple
              @update:model-value="setActivities"
            />
            <button
              class="none-option"
              :class="{ selected: form.activitiesRecorded && !form.activities.length }"
              type="button"
              @click="setActivities([])"
            >
              Без активности
            </button>
          </SurfaceCard>

          <SurfaceCard v-if="blockIsActive('nutrition')" id="nutrition" kind="form" class="form-card--nutrition">
            <FormCardHeading icon="nutrition" tone="green">
              <div>
                <h2>Питание</h2>
                <p>
                  {{ displayedNutritionCriterion || 'Отметьте, как прошёл день относительно вашего ориентира в питании.' }}
                </p>
              </div>
              <RouterLink class="card-settings-link" to="/settings#nutrition-settings">Настроить</RouterLink>
            </FormCardHeading>
            <ChipGroup :model-value="form.nutritionState" :options="nutritionOptions" allow-clear @update:model-value="setNutritionState" />
            <div class="sleep-field-grid">
              <div>
                <FormFieldLabel for="weight-kg">Вес</FormFieldLabel>
                <div class="number-field">
                  <input id="weight-kg" v-model="weightKg" type="text" inputmode="decimal" autocomplete="off" placeholder="82.4" />
                  <span>кг</span>
                </div>
              </div>
            </div>
            <textarea
              v-model="form.nutritionNote"
              rows="2"
              maxlength="180"
              placeholder="Например: много перекусов вечером, ел по плану, пропустил нормальный ужин"
            ></textarea>
          </SurfaceCard>

          <SurfaceCard v-if="showLifeAreas" id="life-areas" kind="form">
            <FormCardHeading icon="event" tone="amber">
              <div>
                <h2>Области жизни</h2>
                <p v-if="isFirstEntry">Что было заметной частью этого дня. Это не оценка успешности.</p>
              </div>
              <RouterLink class="card-settings-link" to="/settings#life-areas">Настроить</RouterLink>
            </FormCardHeading>
            <ChipGroup
              :model-value="form.lifeAreas as LifeAreaId[]"
              :options="dailyLifeAreaItems"
              multiple
              @update:model-value="setLifeAreas"
            />
            <button
              class="none-option"
              :class="{ selected: form.lifeAreasRecorded && !form.lifeAreas.length }"
              type="button"
              @click="setLifeAreas([])"
            >
              Ничего не отмечаю
            </button>
          </SurfaceCard>

          <SurfaceCard v-if="experimentAppliesToSelectedDate" id="experiment" kind="form" class="form-card--experiment">
            <FormCardHeading icon="context" tone="orange">
              <div>
                <h2>Эксперимент</h2>
                <p>{{ store.settings.experiment.title }}</p>
              </div>
              <RouterLink class="card-settings-link" to="/settings#experiment-settings">Настроить</RouterLink>
            </FormCardHeading>
            <p class="form-context experiment-period">Период: {{ experimentPeriodLabel }}</p>
            <p v-if="store.settings.experiment.hypothesis" class="form-context">
              Что хотите узнать: {{ store.settings.experiment.hypothesis }}
            </p>
            <FormFieldLabel>Сегодня получилось это сделать?</FormFieldLabel>
            <div class="binary-choice">
              <button type="button" :class="{ selected: form.experimentCompleted === true }" @click="form.experimentCompleted = true">
                Да
              </button>
              <button type="button" :class="{ selected: form.experimentCompleted === false }" @click="form.experimentCompleted = false">
                Нет
              </button>
              <button type="button" :class="{ selected: form.experimentCompleted === null }" @click="form.experimentCompleted = null">
                Нет отметки
              </button>
            </div>
            <FormFieldLabel for="experiment-note" optional>Что помогло или помешало?</FormFieldLabel>
            <AutoGrowTextarea
              id="experiment-note"
              v-model="form.experimentNote"
              :rows="2"
              :max-length="experimentTextLimits.dailyNote"
              placeholder="Например: заранее убрал телефон; поздний звонок сбил план"
            />
          </SurfaceCard>
        </div>
      </details>
    </form>

    <ReviewNudge
      v-if="!firstUseTakesPriority && activeContextCue === 'review' && activeReviewReminder"
      tag="section"
      aria-label="Период готов к обзору"
    >
      <div>
        <strong>{{ activeReviewReminder.title }}</strong>
        <p>{{ activeReviewReminder.text }}</p>
      </div>
      <ActionButton :as="RouterLink" variant="secondary" class="context-action" :to="activeReviewReminder.to">{{
        activeReviewReminder.label
      }}</ActionButton>
    </ReviewNudge>

    <section v-else-if="!firstUseTakesPriority && activeContextCue === 'recovery'" class="recovery-nudge" aria-label="Вчера без записи">
      <div>
        <strong>Вчера без записи</strong>
        <p>Можно заполнить коротко сейчас или спокойно продолжить с сегодняшнего дня.</p>
      </div>
      <ActionButton variant="secondary" class="context-action" type="button" @click="fillYesterday">Добавить запись</ActionButton>
    </section>

    <section v-else-if="!firstUseTakesPriority && activeContextCue === 'plan'" class="today-pulse" aria-label="Текущий план недели">
      <div>
        <EyebrowText>План недели</EyebrowText>
        <p>{{ currentWeeklyPlan }}</p>
      </div>
    </section>

    <AiAnalysisNudge
      v-else-if="!firstUseTakesPriority && activeContextCue === 'ai'"
      @dismiss="dismissAiAnalysisNudge()"
      @prepare="dismissAiAnalysisNudge()"
    />

    <section v-else-if="!firstUseTakesPriority && activeContextCue === 'pulse'" class="today-pulse" aria-label="Пульс недели">
      <div>
        <EyebrowText>Пульс недели</EyebrowText>
        <p>
          {{ currentWeekSummary.coveredEntriesCount }}
          {{ currentWeekSummary.coveredEntriesCount === 1 ? 'заполненный день' : 'заполненных дней' }} · сон
          {{ formatMinutes(currentWeekSummary.averageSleep === null ? null : Math.round(currentWeekSummary.averageSleep)) }} ·
          {{ currentWeekSummary.externalActionDays }} дн. с шагом к цели
        </p>
      </div>
      <p v-if="currentWeekObservation">{{ currentWeekObservation.text }}</p>
    </section>

    <PwaInstallNudge
      v-if="!firstUseTakesPriority && isToday"
      :active="activeContextCue === 'pwa'"
      :saved-entry-count="store.dailyEntries.length"
      @availability-change="pwaNudgeAvailable = $event"
    />

    <JournalQuickCapture v-if="!firstUseTakesPriority && !isFirstEntry" />
    <DailyLayoutSettings v-if="!firstUseTakesPriority && !isFirstEntry" />

    <Teleport to="body">
      <Transition name="floating-save">
        <ActionButton
          v-if="isDirty"
          variant="primary"
          class="floating-save-button"
          type="button"
          :disabled="saveButtonDisabled"
          @click="save"
        >
          <span>{{ saveButtonText }}</span
          ><span><UiIcon name="arrow-right" /></span>
        </ActionButton>
      </Transition>
    </Teleport>

    <CurrentGoalDialog
      :open="goalDialogOpen"
      :title="store.settings.activeFocusTitle"
      :outcome-criterion="store.settings.focusOutcomeCriterion"
      :review-date="store.settings.focusReviewDate"
      :external-evidence-criterion="store.settings.externalEvidenceCriterion"
      :saving="goalSaving"
      @close="closeCurrentGoalDialog"
      @remove="removeCurrentGoal"
      @save="saveCurrentGoal"
    />
  </PageShell>
</template>

<style scoped src="./TodayView.css"></style>
