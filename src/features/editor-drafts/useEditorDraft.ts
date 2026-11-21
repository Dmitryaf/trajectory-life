import { computed, getCurrentInstance, onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue';
import { onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router';
import { useAppStore } from '@/stores/app';

type Options = {
  key: Readonly<Ref<string>>;
  value: () => string;
  baseline: () => string;
  dirty: Readonly<Ref<boolean>>;
  restore: (value: string, baseline: string) => void;
  reset?: () => void;
};

/** Local protection only: a draft never becomes a journal or review record. */
export function useEditorDraft(options: Options) {
  const store = useAppStore();
  const scope = store.createCloudOperationScope();
  let generation = store.editorDraftGeneration;
  const error = ref(false);
  const restored = ref(false);
  const protectedValue = ref('');
  const suspended = ref(false);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: Promise<boolean> | undefined;
  let disposed = false;
  const notice = computed(() => {
    if (error.value) {
      return 'Не удалось защитить черновик. Повторите попытку перед уходом со страницы.';
    }
    if (!options.dirty.value) {
      return '';
    }
    if (protectedValue.value !== options.value()) {
      return 'Сохраняю черновик на этом устройстве…';
    }
    return restored.value
      ? 'Восстановлен черновик. Он хранится только на этом устройстве и ещё не добавлен в историю.'
      : 'Черновик сохранён на этом устройстве. Добавьте запись в историю кнопкой сохранения.';
  });
  function cancelTimer() {
    clearTimeout(timer);
    timer = undefined;
  }
  function currentOwner() {
    try {
      scope.assertCurrent();
      return true;
    } catch {
      return false;
    }
  }

  async function flush(): Promise<boolean> {
    cancelTimer();
    if (!currentOwner()) {
      return false;
    }
    if (pending) {
      await pending;
      return flush();
    }
    if (suspended.value || (protectedValue.value === options.value() && !error.value)) {
      return true;
    }
    const key = options.key.value;
    const value = options.value();
    const dirty = options.dirty.value;
    if (!dirty && !store.editorDraftByKey(key)) {
      protectedValue.value = value;
      return true;
    }
    const operation = dirty
      ? store.saveEditorDraft({ key, value, baseline: options.baseline(), updatedAt: new Date().toISOString() }, generation)
      : store.removeEditorDraft(key);
    pending = operation
      .then(() => {
        if (options.key.value === key && currentOwner()) {
          protectedValue.value = value;
          error.value = false;
        }
        return true;
      })
      .catch(() => {
        if (options.key.value === key) {
          error.value = true;
        }
        return false;
      });
    const result = await pending;
    pending = undefined;
    if (result && options.key.value === key && options.value() !== value && !disposed) {
      return flush();
    }
    return result;
  }

  function restore(sourceKey = options.key.value) {
    cancelTimer();
    error.value = false;
    restored.value = false;
    const draft = store.editorDraftByKey(sourceKey);
    if (draft) {
      suspended.value = true;
      try {
        options.restore(draft.value, draft.baseline);
        restored.value = true;
      } catch {
        error.value = true;
      } finally {
        suspended.value = false;
      }
    }
    protectedValue.value = draft && sourceKey !== options.key.value && !error.value ? '' : options.value();
    if (protectedValue.value === '') {
      void flush();
    }
  }

  function saved(value = options.value()) {
    cancelTimer();
    protectedValue.value = value;
    restored.value = false;
    error.value = false;
  }

  async function discard() {
    cancelTimer();
    if (pending) {
      await pending;
    }
    try {
      scope.assertCurrent();
      await store.removeEditorDraft(options.key.value);
      saved();
      return true;
    } catch {
      error.value = true;
      return false;
    }
  }

  async function beforeLeave() {
    if (suspended.value) {
      return false;
    }
    return (await flush()) || window.confirm('Черновик не удалось сохранить. Уйти и потерять последние изменения?');
  }
  function beforeUnload(event: BeforeUnloadEvent) {
    if (options.dirty.value && (options.value() !== protectedValue.value || error.value || pending)) {
      void flush();
      event.preventDefault();
      event.returnValue = '';
    }
  }
  function protectOnHide() {
    if (document.visibilityState === 'hidden' && options.dirty.value) {
      void flush();
    }
  }
  watch(
    () => store.editorDraftGeneration,
    (value) => {
      cancelTimer();
      generation = value;
      options.reset?.();
    },
  );
  watch(
    options.value,
    () => {
      if (suspended.value || disposed || !currentOwner()) {
        return;
      }
      cancelTimer();
      timer = setTimeout(() => {
        void flush();
      }, 400);
    },
    { flush: 'sync' },
  );
  if (getCurrentInstance()?.appContext.config.globalProperties.$router) {
    onBeforeRouteLeave(beforeLeave);
    onBeforeRouteUpdate(beforeLeave);
  }
  onMounted(() => {
    window.addEventListener('beforeunload', beforeUnload);
    document.addEventListener('visibilitychange', protectOnHide);
  });
  onBeforeUnmount(() => {
    disposed = true;
    cancelTimer();
    window.removeEventListener('beforeunload', beforeUnload);
    document.removeEventListener('visibilitychange', protectOnHide);
  });
  return { error, notice, suspended, restore, saved, discard, flush, beforeLeave, currentOwner };
}
