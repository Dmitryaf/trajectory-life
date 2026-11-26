import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue';
import { editorDraftKey } from '@/model/editorDraft';
import { normalizeSelfReminder, selfReminderCategories, type SelfReminder, type SelfReminderText } from '@/model/selfReminder';
import { notifySaved, notifyUnknownError } from '@/services/notifications';
import { plainCopy } from '@/services/plain';
import { useAppStore } from '@/stores/app';
import { useEditorDraft } from '../editor-drafts/useEditorDraft';
import { JournalChangedError } from '../journal/version';
import { setSyncEditorDirty } from '../sync/editing';

const editorId = 'self-reminder';
const emptyForm: Required<SelfReminderText> = { category: 'principle', title: '', text: '' };

export function useSelfReminderEditor() {
  const store = useAppStore();
  const open = ref(false);
  const form = ref({ ...emptyForm });
  const source = shallowRef<SelfReminder | null>(null);
  const busy = ref(false);
  const conflict = ref(false);
  const key = computed(() => editorDraftKey(editorId));
  const dirty = computed(() => {
    if (!source.value && !form.value.text && !form.value.title) {
      return false;
    }
    const base = source.value ?? emptyForm;
    return (
      open.value && (form.value.text !== base.text || form.value.category !== base.category || form.value.title !== (base.title ?? ''))
    );
  });
  const drafts = useEditorDraft({
    key,
    dirty,
    value: () => JSON.stringify(form.value),
    baseline: () => JSON.stringify(source.value),
    reset: () => load(null, false),
    restore(value, baseline) {
      const restored = JSON.parse(value) as SelfReminderText;
      if (
        typeof restored?.text !== 'string' ||
        (restored.title !== undefined && typeof restored.title !== 'string') ||
        !selfReminderCategories.some((option) => option.value === restored.category)
      ) {
        throw new Error('Некорректный черновик напоминания');
      }
      const original: unknown = JSON.parse(baseline);
      source.value = original === null ? null : normalizeSelfReminder(original);
      form.value = { category: restored.category, title: restored.title ?? '', text: restored.text };
      open.value = true;
    },
  });

  function load(reminder: SelfReminder | null, show = true) {
    source.value = plainCopy(reminder);
    form.value = reminder ? { category: reminder.category, title: reminder.title ?? '', text: reminder.text } : { ...emptyForm };
    conflict.value = false;
    open.value = show;
    drafts.saved();
  }

  function latest() {
    return store.selfReminders.find((reminder) => reminder.id === source.value?.id) ?? null;
  }

  async function finish(showLatest = false) {
    if (busy.value || (dirty.value && !window.confirm('Закрыть редактор и удалить несохранённый черновик?'))) {
      return;
    }
    busy.value = true;
    try {
      if (await drafts.discard()) {
        const reminder = showLatest ? latest() : null;
        load(reminder, Boolean(reminder));
      }
    } finally {
      busy.value = false;
    }
  }

  async function save(replace = false) {
    if (busy.value || !form.value.text.trim() || (conflict.value && !replace)) {
      return;
    }
    busy.value = true;
    try {
      await drafts.flush();
      if (!drafts.currentOwner()) {
        return;
      }
      drafts.suspended.value = true;
      await store.saveSelfReminder(plainCopy(form.value), replace ? plainCopy(latest()) : source.value, key.value);
      load(null, false);
      notifySaved('Запись сохранена');
    } catch (error) {
      if (error instanceof JournalChangedError) {
        conflict.value = true;
        await store.load().catch(() => undefined);
      } else {
        notifyUnknownError(error, 'Не удалось сохранить напоминание');
      }
    } finally {
      drafts.suspended.value = false;
      busy.value = false;
    }
  }

  async function remove(reminder: SelfReminder) {
    if (busy.value || !window.confirm('Удалить это напоминание?')) {
      return;
    }
    busy.value = true;
    try {
      await store.removeSelfReminder(plainCopy(reminder));
      notifySaved('Напоминание удалено');
    } catch (error) {
      notifyUnknownError(error, 'Не удалось удалить напоминание');
      if (error instanceof JournalChangedError) {
        await store.load().catch(() => undefined);
      }
    } finally {
      busy.value = false;
    }
  }

  watch(dirty, (value) => setSyncEditorDirty(editorId, value), { flush: 'sync' });
  onBeforeUnmount(() => setSyncEditorDirty(editorId, false));
  drafts.restore();

  return { open, form, source, busy, conflict, drafts, load, finish, save, remove };
}
