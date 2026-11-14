// @vitest-environment happy-dom
import { mount, flushPromises } from '@vue/test-utils';
import { computed, defineComponent, ref } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import { createStore } from '../helpers/viewScenario';
import { useEditorDraft } from '@/features/editor-drafts/useEditorDraft';

describe('local editor drafts', () => {
  function setup() {
    const { pinia, store } = createStore();
    vi.spyOn(store, 'saveEditorDraft').mockImplementation(async (draft) => {
      store.editorDrafts = [...store.editorDrafts.filter((item) => item.key !== draft.key), draft];
    });
    vi.spyOn(store, 'removeEditorDraft').mockImplementation(async (key) => {
      store.forgetEditorDraft(key);
    });
    const key = ref('event:new');
    const text = ref('');
    let drafts!: ReturnType<typeof useEditorDraft>;
    const wrapper = mount(
      defineComponent({
        setup() {
          drafts = useEditorDraft({
            key,
            value: () => text.value,
            baseline: () => 'null',
            dirty: computed(() => Boolean(text.value)),
            restore: (value) => {
              text.value = value;
            },
          });
          return () => null;
        },
      }),
      { global: { plugins: [pinia] } },
    );
    return { store, text, key, drafts, wrapper };
  }
  it('flushes the latest text before leaving and restores it without creating a saved record', async () => {
    const { store, text, drafts } = setup();
    text.value = 'Незавершённая мысль';
    expect(await drafts.beforeLeave()).toBe(true);
    text.value = '';
    drafts.restore();
    expect(text.value).toBe('Незавершённая мысль');
    expect(drafts.notice.value).toContain('Восстановлен');
    expect(store.lifeEvents).toEqual([]);
  });
  it('keeps text visible and blocks unprotected departure if storage fails, then retries', async () => {
    const { store, text, drafts } = setup();
    vi.mocked(store.saveEditorDraft).mockRejectedValueOnce(new Error('full'));
    text.value = 'Не потерять';
    expect(await drafts.beforeLeave()).toBe(false);
    expect(drafts.error.value).toBe(true);
    expect(text.value).toBe('Не потерять');
    expect(await drafts.flush()).toBe(true);
    expect(drafts.error.value).toBe(false);
  });
  it('does not recreate a draft after saving and unmounting', async () => {
    const { store, text, drafts, wrapper } = setup();
    text.value = 'Готово';
    await drafts.flush();
    await store.removeEditorDraft('event:new');
    drafts.saved();
    wrapper.unmount();
    await vi.advanceTimersByTimeAsync(600);
    expect(store.editorDrafts).toEqual([]);
  });
  it('cancels delayed writes when the data owner changes', async () => {
    const { store, text } = setup();
    text.value = 'Личный текст';
    store.unload();
    await vi.advanceTimersByTimeAsync(600);
    await flushPromises();
    expect(store.saveEditorDraft).not.toHaveBeenCalled();
  });
});
