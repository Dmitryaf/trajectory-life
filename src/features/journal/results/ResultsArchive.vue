<script setup lang="ts">
import { computed, ref } from 'vue';
import ActionButton from '@/shared/ui/actions/ActionButton.vue';
import ClampedText from '@/shared/ui/content/ClampedText.vue';
import AutoGrowTextarea from '@/shared/ui/forms/AutoGrowTextarea.vue';
import ChipGroup from '@/shared/ui/forms/ChipGroup.vue';
import DateInput from '@/shared/ui/forms/DateInput.vue';
import FormCardHeading from '@/shared/ui/forms/FormCardHeading.vue';
import { formatDate } from '@/services/dates';
import { notifyInfo, notifyUnknownError } from '@/services/notifications';
import { useAppStore } from '@/stores/app';
import { resultAreaOptions, unassignedResultArea, type ResultRecord } from '@/types';
import { archiveRangeFromQuery, newJournalDate, useArchiveEntryId } from '../archiveQuery';
import { useArchiveList } from '../useArchiveList';
import ArchiveDateRange from '../ui/ArchiveDateRange.vue';
import ArchiveEntryCard from '../ui/ArchiveEntryCard.vue';
import ArchiveEntryList from '../ui/ArchiveEntryList.vue';
import ArchivePage from '../ui/ArchivePage.vue';
import JournalDraftStatus from '../ui/JournalDraftStatus.vue';
import { useJournalEditor } from '../useJournalEditor';

const store = useAppStore();
const editor = useJournalEditor<ResultRecord>({
  kind: 'result',
  empty: () => ({ id: undefined, date: newJournalDate(), title: '', note: '', area: unassignedResultArea, createdAt: '' }),
  records: () => store.results,
  titleLimit: 160,
  persist: (record, expected, key) =>
    record.id === undefined
      ? store.addResult({ date: record.date, area: record.area, title: record.title, note: record.note }, key)
      : store.updateResult(record, expected, key),
});
const { title, note, date, area, editingId, saving, titleExpanded, conflict, dirty, drafts, edit, resetForm, save: saveResult } = editor;
const removingIds = ref<number[]>([]);
const archiveRange = archiveRangeFromQuery();
const recentResults = computed(() => [...store.results].sort((a, b) => b.date.localeCompare(a.date)));
const resultOptions = computed(() => [...resultAreaOptions, ...store.settings.customLifeAreaOptions]);
const resultEntryOptions = computed(() => [
  ...resultAreaOptions,
  ...store.settings.customLifeAreaOptions.filter((option) => !option.archived || option.id === area.value),
]);
const {
  filterText,
  filterCategory: filterArea,
  dateFrom,
  dateTo,
  currentPage,
  filteredItems: filteredResults,
  pageCount,
  visibleItems: pagedResults,
} = useArchiveList(recentResults, {
  getSearchText: (result) => `${result.title} ${result.note}`,
  getCategory: (result) => result.area,
  ...archiveRange,
});

const requestedEntry = useArchiveEntryId();
const visibleResults = computed(() =>
  requestedEntry.value === null ? pagedResults.value : recentResults.value.filter((item) => String(item.id) === requestedEntry.value),
);

async function remove(id?: number) {
  if (id === undefined || removingIds.value.includes(id) || !window.confirm('Удалить этот итог?')) {
    return;
  }
  removingIds.value.push(id);
  try {
    await store.removeResult(id);
    if (editingId.value === id) {
      await drafts.discard();
      await editor.reload();
    }
    notifyInfo('Итог удалён');
  } catch (error) {
    notifyUnknownError(error, 'Не удалось удалить итог');
  } finally {
    removingIds.value = removingIds.value.filter((item) => item !== id);
  }
}

function areaMeta(value: ResultRecord['area']) {
  return resultOptions.value.find((option) => option.id === value) ?? { id: value, label: value, icon: '+' };
}

function resultKey(result: ResultRecord) {
  return String(result.id ?? result.createdAt);
}
</script>

<template>
  <ArchivePage
    tone="results"
    heading-eyebrow="Конкретные результаты"
    heading-title="Итоги"
    heading-description="Сделанное дело или полученный результат."
    archive-eyebrow="Архив"
    archive-title="Итоги"
    :editing-id="editingId"
    :open-composer="editor.createRequested || dirty || editor.draftOptions.value.length > 0"
    :empty-archive="recentResults.length === 0"
    :count="filteredResults.length"
    :active-filters="Number(filterArea !== 'all') + Number(Boolean(dateFrom || dateTo))"
    :has-items="visibleResults.length > 0"
    :selected-entry="requestedEntry !== null"
    empty-icon="result"
    :empty-title="recentResults.length ? 'Ничего не найдено' : 'Итогов пока нет'"
    :empty-description="
      recentResults.length ? 'Измените фильтры или диапазон дат.' : 'Добавьте первое сделанное дело или полученный результат.'
    "
  >
    <template #composer>
      <FormCardHeading icon="result" tone="green">
        <div>
          <h2>{{ editingId === null ? 'Добавить итог' : 'Редактировать итог' }}</h2>
          <p>Запишите одним предложением, что вы сделали или какой результат получили.</p>
        </div>
      </FormCardHeading>
      <JournalDraftStatus
        :notice="drafts.notice"
        :error="drafts.error"
        :conflict="conflict"
        :saving="saving"
        :drafts="editor.draftOptions.value"
        @retry="drafts.flush"
        @reload="editor.reload"
        @replace="editor.replace"
        @open="editor.openDraft"
      />
      <fieldset :disabled="saving" class="journal-fields">
        <label class="journal-note-label" for="result-note">Что получилось</label>
        <AutoGrowTextarea
          id="result-note"
          v-model="note"
          :rows="4"
          :max-length="2000"
          placeholder="Что произошло, почему это важно и какие подробности хочется запомнить"
          :disabled="saving"
        />
      </fieldset>
      <div class="composer-actions">
        <ActionButton
          variant="primary"
          type="button"
          :disabled="(!title.trim() && !note.trim()) || !date || saving || conflict"
          @click="saveResult()"
        >
          {{ editingId === null ? 'Добавить итог' : 'Сохранить итог' }}
        </ActionButton>
        <ActionButton v-if="editingId !== null || dirty" variant="secondary" class="composer-cancel" type="button" @click="resetForm">
          {{ editingId === null ? 'Удалить черновик' : 'Отменить редактирование' }}
        </ActionButton>
        <DateInput v-model="date" class="journal-date" required aria-label="Дата итога" :disabled="saving" />
      </div>
      <fieldset :disabled="saving" class="journal-fields">
        <details :open="titleExpanded" class="journal-title" @toggle="titleExpanded = ($event.currentTarget as HTMLDetailsElement).open">
          <summary>Название и область</summary>
          <div class="result-composer__fields">
            <label for="result-title">Название (необязательно)</label>
            <input
              id="result-title"
              v-model="title"
              :disabled="saving"
              type="text"
              maxlength="160"
              placeholder="Что вы сделали или какой результат получили"
              @keydown.enter.prevent="saveResult()"
            />
          </div>
          <p class="journal-note-label">Область (необязательно)</p>
          <ChipGroup v-model="area" :options="resultEntryOptions" />
        </details>
      </fieldset>
    </template>
    <template #search>
      <label class="archive-filter-field">
        <span class="archive-filter-field__label">Поиск</span>
        <input v-model="filterText" type="search" placeholder="Поиск по итогам" aria-label="Поиск по итогам" />
      </label>
    </template>
    <template #filters>
      <label class="archive-filter-field">
        <span class="archive-filter-field__label">Область</span>
        <select v-model="filterArea" aria-label="Область итога">
          <option value="all">Все области</option>
          <option v-for="option in resultOptions" :key="option.id" :value="option.id">{{ option.label }}</option>
        </select>
      </label>
      <ArchiveDateRange v-model:date-from="dateFrom" v-model:date-to="dateTo" context-label="итогов" />
    </template>
    <ArchiveEntryList
      v-model:page="currentPage"
      tone="results"
      :page-count="requestedEntry === null ? pageCount : 1"
      context-label="итогов"
    >
      <ArchiveEntryCard
        v-for="result in visibleResults"
        :key="result.id ?? result.createdAt"
        tone="results"
        :icon="areaMeta(result.area).icon"
        :title="result.title"
        :metadata="`${areaMeta(result.area).label} · ${formatDate(result.date, { day: 'numeric', month: 'short', year: 'numeric' })}`"
      >
        <ClampedText
          v-if="result.note && result.note !== result.title"
          :text="result.note"
          :content-id="`result-note-${resultKey(result)}`"
          text-class="result-item__note"
          tone="result"
        />
        <template #actions>
          <ActionButton variant="secondary" aria-label="Редактировать итог" @click="edit(result)">Редактировать</ActionButton>
          <ActionButton
            variant="danger"
            aria-label="Удалить итог"
            :disabled="result.id !== undefined && removingIds.includes(result.id)"
            @click="remove(result.id)"
            >Удалить</ActionButton
          >
        </template>
      </ArchiveEntryCard>
    </ArchiveEntryList>
  </ArchivePage>
</template>

<style scoped>
.result-composer__fields {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 10px;
  margin: 14px 0 10px;
}

@media (max-width: 720px) {
  .result-composer__fields {
    grid-template-columns: 1fr;
  }

  .result-composer__fields :deep(.date-input) {
    width: 100%;
  }
}
</style>
