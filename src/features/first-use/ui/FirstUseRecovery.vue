<script setup lang="ts">
import ActionButton from '@/shared/ui/actions/ActionButton.vue';
import { computed, getCurrentInstance, onMounted, reactive, ref, watch } from 'vue';
import type { Router } from 'vue-router';
import { captureProductEvent, emitProductEvent } from '@/features/telemetry/productTelemetry';
import { captureDecisionSave, captureReviewSave } from '@/features/reviews/telemetry';
import { firstUsePeriodOptions, recommendedFirstUsePeriod, type FirstUsePeriodOption } from '../period';
import WeeklyReviewJournalLinks from '@/features/reviews/ui/WeeklyReviewJournalLinks.vue';
import WeeklyReviewOverview from '@/features/reviews/ui/WeeklyReviewOverview.vue';
import FormFieldLabel from '@/shared/ui/forms/FormFieldLabel.vue';
import EyebrowText from '@/shared/ui/typography/EyebrowText.vue';
import { addDays, formatDate } from '@/services/dates';
import { plainCopy } from '@/services/plain';
import { useAppStore } from '@/stores/app';
import { emptyWeeklyReview, type FirstUseState, type FirstUseStep, type WeeklyReview } from '@/types';

type DecisionChoice = '' | 'continue' | 'change' | 'later';

const props = withDefaults(defineProps<{ showAvailablePrompt?: boolean }>(), { showAvailablePrompt: true });
const emit = defineEmits<{ availableHidden: [] }>();

const store = useAppStore();
const router = getCurrentInstance()?.appContext.config.globalProperties.$router as Router | undefined;
const editRequested = new URL(window.location.href).searchParams.get('first-use') === 'edit';
const saving = ref(false);
const saveError = ref('');
const review = reactive<WeeklyReview>(emptyWeeklyReview(''));
const resultsText = ref('');
const highlightsText = ref('');
const stateContext = ref('');
const support = ref('');
const obstacle = ref('');
const decision = ref<DecisionChoice>('');
const decisionText = ref('');
const ifThenPlan = ref('');
const periodOptions = firstUsePeriodOptions();
const selectedWeekStart = ref(recommendedFirstUsePeriod().weekStart);

const steps: FirstUseStep[] = ['results', 'highlights', 'state_context', 'support_obstacle', 'decision'];
const firstUse = computed(() => store.settings.firstUse);
const isChoice = computed(
  () => firstUse.value.status === 'not_started' || (firstUse.value.status === 'in_progress' && firstUse.value.lastStep === 'choice'),
);
const availablePromptVisible = computed(
  () => props.showAvailablePrompt && firstUse.value.status === 'available' && store.dailyEntries.length > 0,
);
const isRecovery = computed(() => firstUse.value.status === 'in_progress' && !isChoice.value);
const currentStep = computed(() => firstUse.value.lastStep);
const currentStepIndex = computed(() => steps.indexOf(currentStep.value));
const selectedPeriod = computed(() => periodOptions.find((option) => option.weekStart === selectedWeekStart.value) ?? periodOptions[0]!);
const targetWeekStart = computed(() => firstUse.value.weekStart || selectedPeriod.value.weekStart);
const targetPeriodEnd = computed(() => firstUse.value.periodEnd || selectedPeriod.value.periodEnd);
const calendarWeekEnd = computed(() => addDays(targetWeekStart.value, 6));
const periodIsIncomplete = computed(() => targetPeriodEnd.value < calendarWeekEnd.value);
const weekLabel = computed(
  () => `${formatDate(targetWeekStart.value)} — ${formatDate(targetPeriodEnd.value, { day: 'numeric', month: 'long', year: 'numeric' })}`,
);
const meaningfulAnswerCount = computed(
  () =>
    review.results.filter(Boolean).length +
    review.highlights.filter(Boolean).length +
    [review.stateContext, review.support, review.obstacle].filter((value) => value.trim()).length,
);
const currentAnswerIsValid = computed(
  () => currentStep.value !== 'decision' || decision.value !== 'change' || Boolean(decisionText.value.trim()),
);

watch(
  () => `${firstUse.value.status}:${firstUse.value.weekStart}:${firstUse.value.periodEnd}:${firstUse.value.lastStep}`,
  () => loadDraft(),
  { immediate: true },
);
watch(
  () => isRecovery.value && currentStep.value === 'overview',
  (visible) => {
    if (visible) {
      emitProductEvent('first_use_overview_viewed', {});
    }
  },
  { immediate: true },
);

onMounted(() => {
  if (editRequested && firstUse.value.status === 'completed' && firstUse.value.weekStart) {
    void reopenRecovery();
  }
});

function lines(value: string) {
  return value
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean);
}

function periodTitle(option: FirstUsePeriodOption) {
  return option.id === 'current' ? 'Эта неделя' : 'Прошлая неделя';
}

function periodRange(option: FirstUsePeriodOption) {
  return `${formatDate(option.weekStart)} — ${formatDate(option.periodEnd, { day: 'numeric', month: 'long', year: 'numeric' })}`;
}

function periodStatus(option: FirstUsePeriodOption) {
  return option.completed ? 'Завершённая неделя' : `До сегодня · ${option.coveredDays} из 7 дней`;
}

function loadDraft() {
  if (!firstUse.value.weekStart) {
    return;
  }
  const existing = store.reviewByWeek(firstUse.value.weekStart);
  Object.assign(review, emptyWeeklyReview(firstUse.value.weekStart), existing ? plainCopy(existing) : {});
  review.coveredThrough = firstUse.value.periodEnd;
  resultsText.value = review.results.filter(Boolean).join('\n');
  highlightsText.value = review.highlights.filter(Boolean).join('\n');
  stateContext.value = review.stateContext;
  support.value = review.support;
  obstacle.value = review.obstacle;
  if (review.nextLever === 'Продолжить как есть') {
    decision.value = 'continue';
  } else if (review.nextLever === 'Пока без решения') {
    decision.value = 'later';
  } else if (review.nextLever) {
    decision.value = 'change';
  } else {
    decision.value = '';
  }
  decisionText.value = decision.value === 'change' ? review.nextLever : '';
  ifThenPlan.value = review.ifThenPlan;
}

async function saveFirstUse(next: FirstUseState) {
  const settings = plainCopy(store.settings);
  settings.firstUse = { ...next, updatedAt: new Date().toISOString() };
  await store.saveSettings(settings);
}

async function beginRecovery() {
  const recordStart = captureProductEvent('first_use_started', {});
  saveError.value = '';
  saving.value = true;
  try {
    const weekStart = targetWeekStart.value;
    const periodEnd = targetPeriodEnd.value;
    await saveFirstUse({ status: 'in_progress', weekStart, periodEnd, lastStep: 'results', overviewSeen: false, updatedAt: '' });
    recordStart();
  } catch {
    saveError.value = 'Не удалось начать. Попробуйте ещё раз.';
  } finally {
    saving.value = false;
  }
}

async function reopenRecovery() {
  saveError.value = '';
  saving.value = true;
  try {
    await saveFirstUse({
      status: 'in_progress',
      weekStart: firstUse.value.weekStart,
      periodEnd: firstUse.value.periodEnd,
      lastStep: 'results',
      overviewSeen: true,
      updatedAt: '',
    });
  } catch {
    saveError.value = 'Не удалось открыть ответы. Попробуйте ещё раз.';
  } finally {
    saving.value = false;
  }
}

async function continueWithToday() {
  saveError.value = '';
  saving.value = true;
  try {
    await saveFirstUse({ status: 'available', weekStart: '', periodEnd: '', lastStep: 'choice', overviewSeen: false, updatedAt: '' });
  } catch {
    saveError.value = 'Не удалось сохранить выбор. Попробуйте ещё раз.';
  } finally {
    saving.value = false;
  }
}

async function dismiss() {
  saveError.value = '';
  saving.value = true;
  try {
    await saveFirstUse({ status: 'dismissed', weekStart: '', periodEnd: '', lastStep: 'choice', overviewSeen: false, updatedAt: '' });
  } catch {
    saveError.value = 'Не удалось сохранить выбор. Попробуйте ещё раз.';
  } finally {
    saving.value = false;
  }
}

function hideAvailablePrompt() {
  emit('availableHidden');
}

function applyCurrentAnswer() {
  if (currentStep.value === 'results') {
    review.results = lines(resultsText.value);
  }
  if (currentStep.value === 'highlights') {
    review.highlights = lines(highlightsText.value);
  }
  if (currentStep.value === 'state_context') {
    review.stateContext = stateContext.value.trim();
  }
  if (currentStep.value === 'support_obstacle') {
    review.support = support.value.trim();
    review.obstacle = obstacle.value.trim();
  }
  if (currentStep.value === 'decision') {
    let nextLever = '';
    if (decision.value === 'continue') {
      nextLever = 'Продолжить как есть';
    } else if (decision.value === 'later') {
      nextLever = 'Пока без решения';
    } else if (decision.value === 'change') {
      nextLever = decisionText.value.trim();
    }
    review.nextLever = nextLever;
    review.ifThenPlan = decision.value === 'change' ? ifThenPlan.value.trim() : '';
  }
}

async function moveTo(nextStep: FirstUseStep, saveAnswer: boolean) {
  saveError.value = '';
  saving.value = true;
  try {
    if (saveAnswer) {
      applyCurrentAnswer();
      const recordDecision = captureDecisionSave(review, store.reviewByWeek(review.weekStart));
      await store.saveReview(plainCopy(review));
      recordDecision();
    }
    await saveFirstUse({
      status: 'in_progress',
      weekStart: firstUse.value.weekStart,
      periodEnd: firstUse.value.periodEnd,
      lastStep: nextStep,
      overviewSeen: nextStep === 'overview' || firstUse.value.overviewSeen,
      updatedAt: '',
    });
  } catch {
    saveError.value = 'Не удалось сохранить ответ. Он остался на экране — попробуйте ещё раз.';
  } finally {
    saving.value = false;
  }
}

function nextStep() {
  if (currentStep.value === 'decision') {
    return 'overview';
  }
  const index = currentStepIndex.value;
  return steps[index + 1] ?? 'overview';
}

function previousStep() {
  if (currentStep.value === 'overview') {
    return 'decision';
  }
  const index = currentStepIndex.value;
  return index <= 0 ? 'choice' : steps[index - 1]!;
}

async function completeRecovery() {
  const recordComplete = captureProductEvent('first_use_completed', {});
  const recordReview = captureReviewSave(review, store.reviewByWeek(review.weekStart));
  saveError.value = '';
  saving.value = true;
  try {
    const weekStart = firstUse.value.weekStart;
    await store.saveReview(plainCopy(review));
    await saveFirstUse({
      status: 'completed',
      weekStart,
      periodEnd: firstUse.value.periodEnd,
      lastStep: 'overview',
      overviewSeen: true,
      updatedAt: '',
    });
    recordComplete();
    recordReview();
    if (router) {
      await router.push({ path: '/week', query: { week: weekStart }, hash: '#first-use-overview' });
    }
  } catch {
    saveError.value = 'Не удалось завершить обзор. Ответы остались на экране — попробуйте ещё раз.';
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <section
    v-if="editRequested && firstUse.status === 'completed'"
    class="first-use-card first-use-card--choice"
    aria-labelledby="first-use-edit-title"
  >
    <div>
      <EyebrowText tag="p">Сохранённые ответы</EyebrowText>
      <h2 id="first-use-edit-title">Открываем сохранённые ответы</h2>
      <p>Вы сможете пройти по тем же вопросам и исправить нужные пункты.</p>
    </div>
    <div v-if="saveError" class="first-use-card__actions">
      <ActionButton variant="primary" type="button" :disabled="saving" @click="reopenRecovery">Попробовать ещё раз</ActionButton>
    </div>
    <p v-if="saveError" class="first-use-card__error" role="alert">{{ saveError }}</p>
  </section>

  <section v-else-if="isChoice" class="first-use-card first-use-card--choice" aria-labelledby="first-use-choice-title">
    <div>
      <EyebrowText tag="p">Начало работы</EyebrowText>
      <h2 id="first-use-choice-title">С чего начнём?</h2>
      <p>Можно записать сегодняшний день или вспомнить недавнюю неделю.</p>
      <div class="first-use-card__actions first-use-card__daily-action">
        <ActionButton variant="primary" type="button" :disabled="saving" @click="continueWithToday">Начать с сегодняшнего дня</ActionButton>
      </div>
      <details class="first-use-retrospective" :open="firstUse.status === 'in_progress'">
        <summary>Вспомнить недавнюю неделю</summary>
        <p>Выберите период. Точные цифры и записи за каждый день не нужны.</p>
        <div class="first-use-periods" role="radiogroup" aria-label="Период первого обзора">
          <button
            v-for="option in periodOptions"
            :key="option.id"
            type="button"
            role="radio"
            :aria-checked="selectedWeekStart === option.weekStart"
            @click="selectedWeekStart = option.weekStart"
          >
            <span>
              <strong>{{ periodTitle(option) }}</strong>
              <small>{{ periodRange(option) }}</small>
            </span>
            <em>{{ option.recommended ? `Советуем · ${periodStatus(option)}` : periodStatus(option) }}</em>
          </button>
        </div>
        <ActionButton variant="secondary" type="button" :disabled="saving" @click="beginRecovery">
          {{ firstUse.status === 'in_progress' ? 'Продолжить' : 'Начать обзор' }}
        </ActionButton>
      </details>
    </div>
    <p v-if="saveError" class="first-use-card__error" role="alert">{{ saveError }}</p>
  </section>

  <section v-else-if="availablePromptVisible" class="first-use-card first-use-card--available" aria-label="Первый обзор недели">
    <div>
      <strong>Вспомнить недавнюю неделю?</strong>
      <p>Выберите неделю и ответьте на несколько вопросов о её событиях и делах.</p>
      <div class="first-use-periods first-use-periods--compact" role="radiogroup" aria-label="Период первого обзора">
        <button
          v-for="option in periodOptions"
          :key="option.id"
          type="button"
          role="radio"
          :aria-checked="selectedWeekStart === option.weekStart"
          @click="selectedWeekStart = option.weekStart"
        >
          <span>
            <strong>{{ periodTitle(option) }}</strong>
            <small>{{ periodRange(option) }}</small>
          </span>
          <em>{{ option.recommended ? `Советуем · ${periodStatus(option)}` : periodStatus(option) }}</em>
        </button>
      </div>
    </div>
    <div class="first-use-card__actions">
      <ActionButton variant="secondary" class="context-action" type="button" :disabled="saving" @click="beginRecovery"
        >Открыть обзор</ActionButton
      >
      <button class="first-use-card__text-button" type="button" @click="hideAvailablePrompt">Не сейчас</button>
      <button class="first-use-card__text-button" type="button" :disabled="saving" @click="dismiss">Больше не показывать</button>
    </div>
    <p v-if="saveError" class="first-use-card__error" role="alert">{{ saveError }}</p>
  </section>

  <section v-else-if="isRecovery" class="first-use-card first-use-recovery" aria-labelledby="first-use-step-title">
    <header class="first-use-recovery__header">
      <div>
        <EyebrowText tag="p">{{ currentStep === 'overview' ? 'Ваш обзор' : `Шаг ${currentStepIndex + 1} из ${steps.length}` }}</EyebrowText>
        <span>{{ weekLabel }}{{ periodIsIncomplete ? ' · до сегодняшнего дня' : '' }}</span>
      </div>
      <div v-if="currentStep !== 'overview'" class="first-use-recovery__progress" aria-hidden="true">
        <i :style="{ width: `${((currentStepIndex + 1) / steps.length) * 100}%` }"></i>
      </div>
    </header>

    <div v-if="currentStep === 'results'" class="first-use-recovery__step">
      <h2 id="first-use-step-title">Что вам удалось закончить или получить?</h2>
      <p>Подойдут и большие результаты, и небольшие сделанные дела.</p>
      <FormFieldLabel for="first-use-results">По одному пункту в строке</FormFieldLabel>
      <textarea id="first-use-results" v-model="resultsText" rows="5" placeholder="Например: закончил черновик презентации"></textarea>
    </div>

    <div v-else-if="currentStep === 'highlights'" class="first-use-recovery__step">
      <h2 id="first-use-step-title">Что важного произошло?</h2>
      <p>События, решения, мысли или разговоры, которые хочется помнить.</p>
      <FormFieldLabel for="first-use-highlights">По одному пункту в строке</FormFieldLabel>
      <textarea id="first-use-highlights" v-model="highlightsText" rows="5"></textarea>
    </div>

    <div v-else-if="currentStep === 'state_context'" class="first-use-recovery__step">
      <h2 id="first-use-step-title">Какие обстоятельства повлияли на неделю?</h2>
      <p>Запишите то, что важно для обзора. Этот шаг можно пропустить.</p>
      <FormFieldLabel for="first-use-state">Обстоятельства недели</FormFieldLabel>
      <textarea
        id="first-use-state"
        v-model="stateContext"
        rows="5"
        placeholder="Например: несколько дней работал над одним большим проектом"
      ></textarea>
    </div>

    <div v-else-if="currentStep === 'support_obstacle'" class="first-use-recovery__step">
      <h2 id="first-use-step-title">Что помогало, а что мешало?</h2>
      <p>Оба ответа необязательны.</p>
      <div class="first-use-recovery__paired-fields">
        <label>
          <FormFieldLabel tag="span">Что помогало</FormFieldLabel>
          <textarea v-model="support" rows="4" placeholder="Например: прогулки и свободный вечер"></textarea>
        </label>
        <label>
          <FormFieldLabel tag="span">Что мешало</FormFieldLabel>
          <textarea v-model="obstacle" rows="4" placeholder="Например: плохой сон"></textarea>
        </label>
      </div>
    </div>

    <div v-else-if="currentStep === 'decision'" class="first-use-recovery__step">
      <h2 id="first-use-step-title">Что хотите делать дальше?</h2>
      <p>Можно продолжить как есть, попробовать одно изменение или пока ничего не решать.</p>
      <div class="first-use-recovery__choices" aria-label="Решение после обзора">
        <button type="button" :aria-pressed="decision === 'continue'" @click="decision = 'continue'">Продолжить как есть</button>
        <button type="button" :aria-pressed="decision === 'change'" @click="decision = 'change'">Что-то изменить</button>
        <button type="button" :aria-pressed="decision === 'later'" @click="decision = 'later'">Пока без решения</button>
      </div>
      <template v-if="decision === 'change'">
        <FormFieldLabel for="first-use-decision">Какое одно изменение хотите попробовать?</FormFieldLabel>
        <textarea id="first-use-decision" v-model="decisionText" rows="3"></textarea>
        <p class="first-use-recovery__field-note">
          В следующем обзоре этот ответ появится как ваше прошлое решение — так будет проще посмотреть, что получилось.
        </p>
        <FormFieldLabel for="first-use-plan">Что сделаете, если ситуация повторится? — необязательно</FormFieldLabel>
        <textarea
          id="first-use-plan"
          v-model="ifThenPlan"
          rows="3"
          placeholder="Если снова не будет сил, то перенесу одну необязательную задачу"
        ></textarea>
        <p v-if="!currentAnswerIsValid" class="first-use-recovery__hint">Напишите одно изменение или выберите другой вариант.</p>
      </template>
    </div>

    <div v-else class="first-use-recovery__step first-use-overview">
      <h2 id="first-use-step-title">Ваш обзор недели</h2>
      <p>Ваш обзор сохранён. Позже его можно дополнить.</p>
      <p v-if="periodIsIncomplete" class="first-use-overview__coverage">
        Обзор собран по {{ formatDate(targetPeriodEnd, { day: 'numeric', month: 'long' }) }}. Неделя ещё идёт — позже её можно дополнить.
      </p>
      <WeeklyReviewOverview :review="review" />
      <WeeklyReviewJournalLinks :review="review" />

      <p v-if="meaningfulAnswerCount < 2" class="first-use-overview__empty">
        При желании добавьте события или обстоятельства, которые хочется запомнить.
      </p>
    </div>

    <footer class="first-use-recovery__footer">
      <ActionButton variant="secondary" type="button" :disabled="saving" @click="moveTo(previousStep(), currentStep !== 'overview')">
        {{ currentStep === 'overview' ? 'Исправить ответы' : 'Назад' }}
      </ActionButton>
      <div v-if="currentStep !== 'overview'">
        <button class="first-use-card__text-button" type="button" :disabled="saving" @click="moveTo(nextStep(), false)">Пропустить</button>
        <ActionButton variant="primary" type="button" :disabled="saving || !currentAnswerIsValid" @click="moveTo(nextStep(), true)">
          Продолжить
        </ActionButton>
      </div>
      <div v-else>
        <button class="first-use-card__text-button" type="button" :disabled="saving" @click="continueWithToday">
          Вернуться к сегодняшнему дню
        </button>
        <ActionButton variant="primary" type="button" :disabled="saving || meaningfulAnswerCount < 2" @click="completeRecovery">
          Готово
        </ActionButton>
      </div>
    </footer>
    <p v-if="saveError" class="first-use-card__error" role="alert">{{ saveError }}</p>
  </section>
</template>

<style scoped src="./FirstUseRecovery.css"></style>
