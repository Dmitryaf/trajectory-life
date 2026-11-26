<script setup lang="ts">
import { computed, nextTick, useTemplateRef } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
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
const route = useRoute();
const router = useRouter();
const entryId = computed(() => (typeof route.query.entry === 'string' ? route.query.entry : undefined));
const requestedEntry = computed(() => store.selfReminders.find((item) => item.id === entryId.value));
const activeCategory = computed(
  () =>
    requestedEntry.value?.category ??
    selfReminderCategories.find((item) => '#' + item.value === route.hash)?.value ??
    selfReminderCategories.find((item) => store.selfReminders.some((entry) => entry.category === item.value))?.value ??
    'principle',
);
const categoryEntries = computed(() => store.selfReminders.filter((item) => item.category === activeCategory.value));
const editor = useSelfReminderEditor();
const { open, form, source, busy, conflict, drafts } = editor;
const { notice, error } = drafts;
const field = useTemplateRef<HTMLTextAreaElement>('reminderText');
const placeholder = computed(() => selfReminderCategories.find((option) => option.value === form.value.category)?.placeholder);

async function start(reminder: SelfReminder | null) {
  editor.load(reminder);
  if (!reminder) {
    form.value.category = activeCategory.value;
  }
  await nextTick();
  field.value?.focus();
}
async function save(replace = false) {
  const category = form.value.category;
  await editor.save(replace);
  if (!open.value) {
    await router.replace({ path: '/self-reminders', hash: '#' + category });
  }
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

    <p v-if="entryId && !requestedEntry" role="status">Эта запись больше недоступна.</p>
    <ActionButton v-if="!open" :disabled="busy" @click="start(null)">Добавить запись</ActionButton>
    <SurfaceCard v-else kind="form" class="self-reminders__editor">
      <h2>{{ source ? 'Редактировать запись' : 'Новая запись' }}</h2>
      <form @submit.prevent="save()">
        <label>
          Категория
          <select v-model="form.category" :disabled="busy">
            <option v-for="category in selfReminderCategories" :key="category.value" :value="category.value">{{ category.label }}</option>
          </select>
        </label>
        <label>
          Заголовок (необязательно)
          <input v-model="form.title" type="text" :readonly="busy" />
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
            <ActionButton variant="secondary" :disabled="busy" @click="save(true)">Сохранить мой вариант</ActionButton>
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
      <nav class="self-reminders__categories" aria-label="Категории напоминаний">
        <RouterLink
          v-for="category in selfReminderCategories"
          :key="category.value"
          :to="{ path: '/self-reminders', hash: '#' + category.value }"
          :aria-current="activeCategory === category.value ? 'page' : undefined"
          >{{ category.label }}</RouterLink
        >
      </nav>
      <SelfReminderList v-if="categoryEntries.length" :reminders="categoryEntries" editable :selected-id="entryId">
        <template #actions="{ reminder }">
          <div v-if="!open" class="self-reminders__record-actions">
            <ActionButton variant="secondary" :disabled="busy" @click="start(reminder)">Редактировать</ActionButton>
            <ActionButton variant="danger" class="reminder-remove" :disabled="busy" @click="editor.remove(reminder)">Удалить</ActionButton>
          </div>
        </template>
      </SelfReminderList>
      <p v-else :id="activeCategory">В этой категории пока нет записей.</p>
    </SurfaceCard>
    <p v-else-if="!open" class="self-reminders__empty">Здесь будут ваши напоминания.</p>
  </PageShell>
</template>

<style scoped>
.self-reminders__categories {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  margin-bottom: 12px;
}
.self-reminders__categories a {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  padding-inline: 8px;
  color: var(--brand-strong);
  text-underline-offset: 0.2em;
}
.self-reminders__categories a[aria-current] {
  background: var(--surface-success);
  border-radius: 8px;
  font-weight: 700;
}
.self-reminders__record-actions {
  padding: 4px 6px 10px;
}
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
  padding: 8px 12px;
  border-radius: 8px;
  font-size: 0.875rem;
}
.self-reminders__record-actions button:active:not(:disabled) {
  opacity: 0.72;
}
.self-reminders__record-actions .reminder-remove {
  border: 1px solid var(--action-danger-text);
  background: var(--surface);
}
.self-reminders__record-actions .reminder-remove:hover:not(:disabled) {
  background: var(--action-danger-surface);
}
.self-reminders__record-actions .reminder-remove:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.self-reminders__conflict {
  margin-block: 12px;
  padding: 12px;
  border-radius: 10px;
  background: var(--surface-warning);
}
</style>
