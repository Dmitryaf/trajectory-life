<script setup lang="ts">
import ActionButton from '@/shared/ui/actions/ActionButton.vue';
import DateInput from '@/shared/ui/forms/DateInput.vue';
import { computed, reactive, ref, watch } from 'vue';
import { addDays, formatDate } from '@/services/dates';
import { useAppStore } from '@/stores/app';
import { lifeEventTypeOptions, resultAreaOptions, type LifeEventType, type ResultRecord, type WeeklyReview } from '@/types';

type JournalItem = {
  key: string;
  kind: 'result' | 'event';
  title: string;
};

type JournalDraft = {
  date: string;
  category: string;
};

const props = defineProps<{ review: WeeklyReview }>();
const store = useAppStore();
const drafts = reactive<Record<string, JournalDraft>>({});
const savingKey = ref('');
const saveErrors = reactive<Record<string, string>>({});

const items = computed<JournalItem[]>(() => [
  ...props.review.results
    .map((title, index) => ({ key: `result-${index}-${title.trim()}`, kind: 'result' as const, title: title.trim() }))
    .filter((item) => item.title),
  ...props.review.highlights
    .map((title, index) => ({ key: `event-${index}-${title.trim()}`, kind: 'event' as const, title: title.trim() }))
    .filter((item) => item.title),
]);
const weekEnd = computed(() => props.review.coveredThrough || addDays(props.review.weekStart, 6));
const weekLabel = computed(
  () =>
    `${formatDate(props.review.weekStart, { day: 'numeric', month: 'long' })} — ${formatDate(weekEnd.value, {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })}`,
);
const resultOptions = computed(() => [...resultAreaOptions, ...store.settings.customLifeAreaOptions.filter((option) => !option.archived)]);

watch(
  items,
  (nextItems) => {
    for (const item of nextItems) {
      if (drafts[item.key]) {
        continue;
      }
      if (item.kind === 'result') {
        const existing = store.results.find(
          (record) =>
            record.date >= props.review.weekStart &&
            record.date <= weekEnd.value &&
            normalizedTitle(record.title) === normalizedTitle(item.title),
        );
        drafts[item.key] = existing ? { date: existing.date, category: existing.area } : { date: '', category: '' };
      } else {
        const existing = store.lifeEvents.find(
          (record) =>
            record.date >= props.review.weekStart &&
            record.date <= weekEnd.value &&
            normalizedTitle(record.title) === normalizedTitle(item.title),
        );
        drafts[item.key] = existing ? { date: existing.date, category: existing.type } : { date: '', category: '' };
      }
    }
  },
  { immediate: true },
);

function normalizedTitle(value: string) {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('ru-RU');
}

function isAlreadySaved(item: JournalItem) {
  const draft = drafts[item.key];
  if (!draft?.date) {
    return false;
  }
  const records = item.kind === 'result' ? store.results : store.lifeEvents;
  return records.some((record) => record.date === draft.date && normalizedTitle(record.title) === normalizedTitle(item.title));
}

function canSave(item: JournalItem) {
  const draft = drafts[item.key];
  return Boolean(
    draft?.date &&
    draft.category &&
    draft.date >= props.review.weekStart &&
    draft.date <= weekEnd.value &&
    savingKey.value !== item.key &&
    !isAlreadySaved(item),
  );
}

async function saveToJournal(item: JournalItem) {
  if (!canSave(item)) {
    return;
  }
  const draft = drafts[item.key]!;
  savingKey.value = item.key;
  saveErrors[item.key] = '';
  try {
    if (item.kind === 'result') {
      await store.addResult({
        date: draft.date,
        area: draft.category as ResultRecord['area'],
        title: item.title,
        note: '',
      });
    } else {
      await store.addLifeEvent({
        date: draft.date,
        type: draft.category as LifeEventType,
        title: item.title,
        note: '',
      });
    }
  } catch {
    saveErrors[item.key] = 'Не удалось сохранить. Попробуйте ещё раз.';
  } finally {
    savingKey.value = '';
  }
}
</script>

<template>
  <details v-if="items.length" class="weekly-review-journal">
    <summary>Добавить точные даты в Журнал</summary>
    <div class="weekly-review-journal__content">
      <p>
        Здесь можно выбрать дату только из периода обзора: {{ weekLabel }}. Если пункт относится к другому времени, оставьте его в обзоре
        без вымышленной даты.
      </p>
      <div class="weekly-review-journal__list">
        <article v-for="item in items" :key="item.key" class="weekly-review-journal__item">
          <div class="weekly-review-journal__item-heading">
            <span>{{ item.kind === 'result' ? 'Итог' : 'Событие или мысль' }}</span>
            <strong>{{ item.title }}</strong>
          </div>
          <div class="weekly-review-journal__fields">
            <label>
              <span>Точная дата</span>
              <DateInput v-model="drafts[item.key]!.date" :min="review.weekStart" :max="weekEnd" :aria-label="`Дата: ${item.title}`" />
            </label>
            <label>
              <span>{{ item.kind === 'result' ? 'Область' : 'Тип записи' }}</span>
              <select v-model="drafts[item.key]!.category" :aria-label="`${item.kind === 'result' ? 'Область' : 'Тип'}: ${item.title}`">
                <option value="" disabled>{{ item.kind === 'result' ? 'Выберите область' : 'Выберите тип' }}</option>
                <option v-for="option in item.kind === 'result' ? resultOptions : lifeEventTypeOptions" :key="option.id" :value="option.id">
                  {{ option.label }}
                </option>
              </select>
            </label>
            <ActionButton
              variant="secondary"
              type="button"
              :disabled="!canSave(item)"
              :aria-label="`Сохранить в Журнале: ${item.title}`"
              :busy="savingKey === item.key"
              busy-label="Сохраняем…"
              @click="saveToJournal(item)"
              >Сохранить</ActionButton
            >
          </div>
          <p v-if="isAlreadySaved(item)" class="weekly-review-journal__status">Уже есть в Журнале</p>
          <p v-else-if="saveErrors[item.key]" class="weekly-review-journal__error" role="alert">{{ saveErrors[item.key] }}</p>
        </article>
      </div>
    </div>
  </details>
</template>

<style scoped>
.weekly-review-journal {
  margin-top: 14px;
  border: 1px solid var(--journal-links-border);
  border-radius: 16px;
  background: var(--period-details-surface);
}
.weekly-review-journal > summary {
  padding: 14px 16px;
  color: var(--navy);
  font-weight: 800;
  cursor: pointer;
}
.weekly-review-journal__content {
  padding: 0 16px 16px;
}
.weekly-review-journal__content > p {
  margin: 0 0 12px;
  color: var(--muted);
  font-size: 13px;
  line-height: 1.5;
}
.weekly-review-journal__list {
  display: grid;
  gap: 10px;
}
.weekly-review-journal__item {
  padding: 13px;
  border: 1px solid var(--journal-link-border);
  border-radius: 14px;
  background: var(--surface);
}
.weekly-review-journal__item-heading {
  display: grid;
  gap: 3px;
  margin-bottom: 10px;
}
.weekly-review-journal__item-heading span,
.weekly-review-journal__fields label > span {
  color: var(--muted);
  font-size: 12px;
  font-weight: 750;
}
.weekly-review-journal__item-heading strong {
  color: var(--navy);
  font-size: 14px;
}
.weekly-review-journal__fields {
  display: grid;
  grid-template-columns: minmax(150px, 0.7fr) minmax(180px, 1fr) auto;
  gap: 8px;
  align-items: end;
}
.weekly-review-journal__fields label {
  display: grid;
  gap: 5px;
}
.weekly-review-journal__fields input,
.weekly-review-journal__fields select {
  width: 100%;
  min-width: 0;
}
.weekly-review-journal__fields .secondary-button {
  min-height: 44px;
}
.weekly-review-journal__status,
.weekly-review-journal__error {
  margin: 8px 0 0;
  font-size: 12px;
  font-weight: 750;
}
.weekly-review-journal__status {
  color: var(--journal-link-success);
}
.weekly-review-journal__error {
  color: var(--journal-link-danger);
}

@media (max-width: 720px) {
  .weekly-review-journal__fields {
    grid-template-columns: 1fr;
  }
  .weekly-review-journal__fields .secondary-button {
    width: 100%;
  }
}
</style>
