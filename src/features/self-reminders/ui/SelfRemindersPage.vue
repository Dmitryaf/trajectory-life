<script setup lang="ts">
import { computed, nextTick, useTemplateRef } from 'vue';
import { RouterLink } from 'vue-router';
import { selfReminderCategories, type SelfReminder } from '@/model/selfReminder';
import { useAppStore } from '@/stores/app';
import EditorDraftNotice from '@/features/editor-drafts/EditorDraftNotice.vue';
import ActionButton from '@/shared/ui/actions/ActionButton.vue';
import UiIcon from '@/shared/ui/icons/UiIcon.vue';
import PageHeading from '@/shared/ui/layout/PageHeading.vue';
import PageShell from '@/shared/ui/layout/PageShell.vue';
import SurfaceCard from '@/shared/ui/layout/SurfaceCard.vue';
import { useSelfReminderEditor } from '../useSelfReminderEditor';
import SelfReminderList from './SelfReminderList.vue';

const store = useAppStore();
const editor = useSelfReminderEditor();
const { open, form, source, busy, conflict, drafts } = editor;
const { notice, error } = drafts;
const field = useTemplateRef<HTMLTextAreaElement>('reminderText');
const placeholder = computed(() => selfReminderCategories.find((option) => option.value === form.value.category)?.placeholder);

async function start(reminder: SelfReminder | null) {
  editor.load(reminder);
  await nextTick();
  field.value?.focus();
}
</script>

<template>
  <PageShell class="self-reminders">
    <RouterLink class="self-reminders__back" to="/more"><UiIcon name="arrow-left" />К журналу</RouterLink>
    <PageHeading>
      <div>
        <h1>Напоминания себе</h1>
        <p>Принципы, вопросы и уроки, к которым хочется возвращаться.</p>
      </div>
    </PageHeading>

    <ActionButton v-if="!open" :disabled="busy" @click="start(null)">Добавить запись</ActionButton>
    <SurfaceCard v-else kind="form" class="self-reminders__editor">
      <h2>{{ source ? 'Редактировать запись' : 'Новая запись' }}</h2>
      <form @submit.prevent="editor.save()">
        <label>
          Категория
          <select v-model="form.category" :disabled="busy">
            <option v-for="category in selfReminderCategories" :key="category.value" :value="category.value">{{ category.label }}</option>
          </select>
        </label>
        <label>
          Текст записи
          <textarea ref="reminderText" v-model="form.text" rows="4" :placeholder="placeholder" :readOnly="busy"></textarea>
        </label>
        <EditorDraftNotice :notice="notice" :error="error" @retry="drafts.flush" />
        <div v-if="conflict" role="status" class="self-reminders__conflict">
          <p>Запись изменилась или была удалена. Ваш текст остался в форме.</p>
          <div class="self-reminders__actions">
            <ActionButton variant="secondary" :disabled="busy" @click="editor.finish(true)">Загрузить сохранённую версию</ActionButton>
            <ActionButton variant="secondary" :disabled="busy" @click="editor.save(true)">Сохранить мой вариант</ActionButton>
          </div>
        </div>
        <div class="self-reminders__actions">
          <ActionButton type="submit" :disabled="!form.text.trim() || conflict" :busy="busy" busy-label="Сохраняю…">
            Сохранить запись
          </ActionButton>
          <ActionButton variant="secondary" :disabled="busy" @click="editor.finish()">Отмена</ActionButton>
        </div>
      </form>
    </SurfaceCard>

    <SurfaceCard v-if="store.selfReminders.length" class="self-reminders__collection">
      <SelfReminderList :reminders="store.selfReminders">
        <template #actions="{ reminder }">
          <div v-if="!open" class="self-reminders__record-actions">
            <button type="button" :disabled="busy" @click="start(reminder)">Редактировать</button>
            <button type="button" :disabled="busy" @click="editor.remove(reminder)">Удалить</button>
          </div>
        </template>
      </SelfReminderList>
    </SurfaceCard>
    <p v-else-if="!open" class="self-reminders__empty">Здесь будут ваши напоминания.</p>
  </PageShell>
</template>

<style scoped>
.self-reminders__back {
  display: inline-flex;
  min-height: 44px;
  align-items: center;
  gap: 8px;
  color: var(--brand-strong);
  font-weight: 650;
  text-underline-offset: 0.15em;
}
.self-reminders__editor,
.self-reminders__collection {
  max-width: 760px;
}
.self-reminders__editor h2 {
  margin-bottom: 12px;
}
.self-reminders__editor label {
  display: grid;
  gap: 6px;
  margin-bottom: 12px;
  color: var(--text);
  font-weight: 650;
}
.self-reminders__editor textarea {
  min-height: 108px;
  resize: vertical;
  font-weight: 400;
}
.self-reminders__editor select {
  width: min(100%, 300px);
  min-height: 44px;
  padding: 8px 12px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--surface);
  color: var(--text);
  font: inherit;
}
.self-reminders__collection,
.self-reminders__empty {
  margin-top: 16px;
}
.self-reminders__empty {
  color: var(--muted);
}
.self-reminders__actions,
.self-reminders__record-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.self-reminders__record-actions button {
  min-height: 44px;
  padding: 0 8px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--brand-strong);
  font-size: 0.875rem;
  text-decoration: underline;
  text-underline-offset: 0.15em;
}
.self-reminders__record-actions button:last-child {
  color: var(--action-danger-text);
}
.self-reminders__conflict {
  margin-block: 12px;
  padding: 12px;
  border-radius: 10px;
  background: var(--surface-warning);
}
</style>
