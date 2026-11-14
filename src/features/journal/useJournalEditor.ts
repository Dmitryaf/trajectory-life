import { computed, onBeforeUnmount, reactive, ref, toRefs, watch } from 'vue';
import { useAppStore } from '@/stores/app';
import { plainCopy } from '@/services/plain';
import { notifyError, notifySaved, notifyUnknownError } from '@/services/notifications';
import { useEditorDraft } from '../editor-drafts/useEditorDraft';
import { setSyncEditorDirty } from '../sync/editing';
import { JournalChangedError } from './version';

type Record = { id?: number; date: string; title: string; note: string; createdAt: string };
let nextEditor = 0;
export function useJournalEditor<T extends Record>(options: {
  kind: 'result' | 'event';
  empty: () => T;
  records: () => T[];
  persist: (record: T, expected: T | null, key: string) => Promise<unknown>;
  titleLimit: number;
}) {
  const store = useAppStore();
  const form = reactive(options.empty()) as T;
  const editingId = computed(() => form.id ?? null);
  const key = computed(() => `${options.kind}:${editingId.value ?? 'new'}`);
  const source = computed(() => options.records().find((item) => item.id === editingId.value));
  const baseline = ref('');
  let expected: T | null = null;
  const dirty = computed(() => JSON.stringify(form) !== baseline.value);
  const saving = ref(false);
  const switching = ref(false);
  const titleExpanded = ref(false);
  const busy = computed(() => saving.value || switching.value);
  const conflict = ref(false);
  const editorId = `journal:${++nextEditor}`;
  const createRequested = new URLSearchParams(window.location.search).get('create') === '1';
  const drafts = useEditorDraft({
    reset: () => load(source.value),
    key,
    dirty,
    value: () => JSON.stringify(form),
    baseline: () => JSON.stringify(expected),
    restore(value, original) {
      const restored = JSON.parse(value) as T;
      if (typeof restored.title !== 'string' || typeof restored.note !== 'string' || restored.id !== form.id) {
        throw new Error('Invalid draft');
      }
      expected = JSON.parse(original) as T | null;
      Object.assign(form, restored);
    },
  });
  const draftOptions = computed(() =>
    store.editorDrafts
      .filter((item) => item.key.startsWith(`${options.kind}:`))
      .map((item) => {
        try {
          const value = JSON.parse(item.value) as T;
          return { key: item.key, label: (value.title || value.note || value.date).slice(0, 80) };
        } catch {
          return { key: item.key, label: 'Черновик записи' };
        }
      }),
  );
  function load(record?: T) {
    drafts.suspended.value = true;
    expected = record ? plainCopy(record) : null;
    Object.assign(form, options.empty(), record ? plainCopy(record) : {}, { id: record?.id });
    baseline.value = JSON.stringify(form);
    drafts.suspended.value = false;
    drafts.restore();
    titleExpanded.value = Boolean(form.title) || form.id !== undefined;
    conflict.value = dirty.value && JSON.stringify(source.value ?? null) !== JSON.stringify(expected);
  }
  async function edit(record: T) {
    if (busy.value) {
      return;
    }
    switching.value = true;
    try {
      if (await drafts.beforeLeave()) {
        load(record);
      }
    } finally {
      switching.value = false;
    }
  }
  async function openDraft(draftKey: string) {
    if (busy.value) {
      return;
    }
    switching.value = true;
    try {
      if (!(await drafts.beforeLeave())) {
        return;
      }
      if (draftKey === `${options.kind}:new`) {
        load();
        return;
      }
      const id = Number(draftKey.split(':')[1]);
      const existing = options.records().find((item) => item.id === id);
      const draft = store.editorDraftByKey(draftKey);
      if (existing) {
        load(existing);
      } else if (draft) {
        try {
          load({ ...options.empty(), ...JSON.parse(draft.baseline), id });
        } catch {
          notifyUnknownError(new Error('Повреждён черновик'), 'Не удалось открыть черновик');
        }
      }
    } finally {
      switching.value = false;
    }
  }
  async function resetForm() {
    if (busy.value || (dirty.value && !window.confirm('Удалить несохранённый черновик этой записи?'))) {
      return;
    }
    if (await drafts.discard()) {
      load();
    }
  }
  async function reload() {
    if (busy.value || !(await drafts.discard())) {
      return;
    }
    load(source.value);
  }
  async function save(replace = false) {
    if (busy.value || (!form.title.trim() && !form.note.trim()) || (conflict.value && !replace)) {
      return;
    }
    if (!form.date) {
      notifyError(options.kind === 'result' ? 'Укажите дату итога' : 'Укажите дату события');
      return;
    }
    saving.value = true;
    await drafts.flush();
    if (!drafts.currentOwner()) {
      saving.value = false;
      return;
    }
    drafts.suspended.value = true;
    const originalKey = key.value;
    const originalValue = JSON.stringify(form);
    const record = plainCopy(form);
    record.title = record.title.trim() || record.note.trim().replace(/\s+/g, ' ').slice(0, options.titleLimit);
    record.note = record.note.trim();
    try {
      await options.persist(record, replace ? plainCopy(source.value ?? null) : expected, originalKey);
      // Do not discard text entered while an asynchronous save was in progress.
      if (JSON.stringify(form) === originalValue) {
        drafts.saved();
        load();
      } else {
        expected = plainCopy(source.value ?? record);
        baseline.value = JSON.stringify(record);
      }
      const labels = options.kind === 'result' ? ['Итог добавлен', 'Итог обновлён'] : ['Событие добавлено', 'Событие обновлено'];
      notifySaved(labels[record.id === undefined ? 0 : 1]!);
    } catch (error) {
      if (error instanceof JournalChangedError) {
        conflict.value = true;
        try {
          await store.load();
        } catch {
          /* The form still holds the user's text. */
        }
      } else {
        notifyUnknownError(error, 'Не удалось сохранить запись');
      }
    } finally {
      saving.value = false;
      drafts.suspended.value = false;
      await drafts.flush();
    }
  }
  watch(
    source,
    () => {
      if (saving.value) {
        return;
      }
      if (!dirty.value) {
        load(source.value);
      } else {
        conflict.value = JSON.stringify(source.value ?? null) !== JSON.stringify(expected);
      }
    },
    { deep: true },
  );
  watch(dirty, (value) => setSyncEditorDirty(editorId, value), { flush: 'sync' });
  onBeforeUnmount(() => setSyncEditorDirty(editorId, false));
  load();
  const latest = [...store.editorDrafts]
    .filter((item) => item.key.startsWith(`${options.kind}:`))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  if (!createRequested && latest && latest.key !== key.value) {
    void openDraft(latest.key);
  }
  return {
    ...toRefs(form),
    editingId,
    saving: busy,
    titleExpanded,
    conflict,
    dirty,
    drafts: reactive(drafts),
    draftOptions,
    createRequested,
    edit,
    openDraft,
    resetForm,
    reload,
    save,
    replace: () => save(true),
  };
}
