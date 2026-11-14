<script setup lang="ts">
import { computed, ref } from 'vue';
import ActionButton from '@/shared/ui/actions/ActionButton.vue';
import IconActionButton from '@/shared/ui/actions/IconActionButton.vue';
import ClampedText from '@/shared/ui/content/ClampedText.vue';
import AutoGrowTextarea from '@/shared/ui/forms/AutoGrowTextarea.vue';
import ChipGroup from '@/shared/ui/forms/ChipGroup.vue';
import DateInput from '@/shared/ui/forms/DateInput.vue';
import FormCardHeading from '@/shared/ui/forms/FormCardHeading.vue';
import { formatDate, todayKey } from '@/services/dates';
import { notifyInfo, notifyUnknownError } from '@/services/notifications';
import { useAppStore } from '@/stores/app';
import { lifeEventTypeOptions, type LifeEventRecord } from '@/types';
import { archiveRangeFromQuery } from '../archiveQuery';
import { useArchiveList } from '../useArchiveList';
import ArchiveDateRange from '../ui/ArchiveDateRange.vue';
import ArchiveEntryCard from '../ui/ArchiveEntryCard.vue';
import ArchiveEntryList from '../ui/ArchiveEntryList.vue';
import ArchivePage from '../ui/ArchivePage.vue';
import JournalDraftStatus from '../ui/JournalDraftStatus.vue';
import { useJournalEditor } from '../useJournalEditor';

const store = useAppStore();
const editor = useJournalEditor<LifeEventRecord>({
  kind: 'event',
  empty: () => ({ id: undefined, date: todayKey(), title: '', note: '', type: 'change', createdAt: '' }),
  records: () => store.lifeEvents,
  titleLimit: 140,
  persist: (record, expected, key) =>
    record.id === undefined
      ? store.addLifeEvent({ date: record.date, type: record.type, title: record.title, note: record.note }, key)
      : store.updateLifeEvent(record, expected, key),
});
const { title, note, date, type, editingId, saving, titleExpanded, conflict, dirty, drafts, edit, resetForm, save: saveEvent } = editor;
const removingIds = ref<number[]>([]);
const archiveRange = archiveRangeFromQuery();

const recentEvents = computed(() =>
  [...store.lifeEvents].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)),
);
const {
  filterText,
  filterCategory: filterType,
  dateFrom,
  dateTo,
  currentPage,
  filteredItems: filteredEvents,
  pageCount,
  visibleItems: visibleEvents,
} = useArchiveList(recentEvents, {
  getSearchText: (event) => `${event.title} ${event.note}`,
  getCategory: (event) => event.type,
  ...archiveRange,
});

async function remove(id?: number) {
  if (id === undefined || removingIds.value.includes(id) || !window.confirm('Удалить это событие?')) {
    return;
  }
  removingIds.value.push(id);
  try {
    await store.removeLifeEvent(id);
    if (editingId.value === id) {
      await drafts.discard();
      await editor.reload();
    }
    notifyInfo('Событие удалено');
  } catch (error) {
    notifyUnknownError(error, 'Не удалось удалить событие');
  } finally {
    removingIds.value = removingIds.value.filter((item) => item !== id);
  }
}

function eventMeta(value: LifeEventRecord['type']) {
  return lifeEventTypeOptions.find((option) => option.id === value) ?? lifeEventTypeOptions[0];
}

function eventKey(event: LifeEventRecord) {
  return String(event.id ?? event.createdAt);
}
</script>

<template>
  <ArchivePage
    tone="events"
    heading-eyebrow="Что произошло и что вы заметили"
    heading-title="События и мысли"
    heading-description="Важная ситуация, мысль или деталь дня."
    archive-eyebrow="Хронология"
    archive-title="События и мысли"
    :editing-id="editingId"
    :open-composer="editor.createRequested || dirty || editor.draftOptions.value.length > 0"
    :empty-archive="recentEvents.length === 0"
    :count="filteredEvents.length"
    :has-items="visibleEvents.length > 0"
    empty-icon="event"
    :empty-title="recentEvents.length ? 'Ничего не найдено' : 'Записей пока нет'"
    :empty-description="
      recentEvents.length ? 'Измените фильтры или диапазон дат.' : 'Запишите событие или мысль, которую хочется сохранить.'
    "
  >
    <template #composer>
      <FormCardHeading icon="event" tone="amber">
        <div>
          <h2>{{ editingId === null ? 'Добавить запись' : 'Редактировать запись' }}</h2>
          <p>Выберите, что хотите записать: произошедшее событие или важную мысль.</p>
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
        <ChipGroup v-model="type" :options="lifeEventTypeOptions" />

        <details :open="titleExpanded" class="journal-title" @toggle="titleExpanded = ($event.currentTarget as HTMLDetailsElement).open">
          <summary>Название (необязательно)</summary>
          <div class="event-composer__fields">
            <input
              v-model="title"
              :disabled="saving"
              type="text"
              maxlength="140"
              placeholder="Короткое название"
              @keydown.enter.prevent="saveEvent()"
            />
          </div>
        </details>
        <DateInput v-model="date" class="journal-date" required aria-label="Дата события" :disabled="saving" />
        <AutoGrowTextarea
          v-model="note"
          :rows="4"
          :max-length="2000"
          placeholder="Что произошло или что вы поняли и почему это важно"
          :disabled="saving"
        />
      </fieldset>
      <div class="composer-actions">
        <ActionButton
          variant="primary"
          type="button"
          :disabled="(!title.trim() && !note.trim()) || !date || saving || conflict"
          @click="saveEvent()"
        >
          {{ editingId === null ? 'Добавить запись' : 'Сохранить запись' }}
        </ActionButton>
        <ActionButton v-if="editingId !== null || dirty" variant="secondary" class="composer-cancel" type="button" @click="resetForm">
          {{ editingId === null ? 'Удалить черновик' : 'Отменить редактирование' }}
        </ActionButton>
      </div>
    </template>
    <template #filters>
      <label class="archive-filter-field">
        <span class="archive-filter-field__label">Поиск</span>
        <input v-model="filterText" type="search" placeholder="Поиск по событиям" aria-label="Поиск по событиям" />
      </label>
      <label class="archive-filter-field">
        <span class="archive-filter-field__label">Тип</span>
        <select v-model="filterType" aria-label="Тип события">
          <option value="all">Все типы</option>
          <option v-for="option in lifeEventTypeOptions" :key="option.id" :value="option.id">{{ option.label }}</option>
        </select>
      </label>
      <ArchiveDateRange v-model:date-from="dateFrom" v-model:date-to="dateTo" context-label="событий" />
    </template>
    <ArchiveEntryList v-model:page="currentPage" tone="events" :page-count="pageCount" context-label="событий">
      <ArchiveEntryCard
        v-for="event in visibleEvents"
        :key="eventKey(event)"
        tone="events"
        :icon="eventMeta(event.type).icon"
        :title="event.title"
        :metadata="`${eventMeta(event.type).label} · ${formatDate(event.date, { day: 'numeric', month: 'short', year: 'numeric' })}`"
      >
        <ClampedText
          v-if="event.note"
          :text="event.note"
          :content-id="`event-note-${eventKey(event)}`"
          text-class="timeline-item__note"
          tone="event"
        />
        <template #actions>
          <IconActionButton icon="edit" label="Редактировать событие" @click="edit(event)" />
          <IconActionButton
            icon="delete"
            danger
            label="Удалить событие"
            :disabled="event.id !== undefined && removingIds.includes(event.id)"
            @click="remove(event.id)"
          />
        </template>
      </ArchiveEntryCard>
    </ArchiveEntryList>
  </ArchivePage>
</template>

<style scoped>
.event-composer__fields {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 10px;
  margin: 14px 0 10px;
}

@media (max-width: 720px) {
  .event-composer__fields {
    grid-template-columns: 1fr;
  }
}
</style>
