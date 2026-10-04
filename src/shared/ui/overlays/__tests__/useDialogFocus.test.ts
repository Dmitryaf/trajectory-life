// @vitest-environment happy-dom

import { mount } from '@vue/test-utils';
import { defineComponent, nextTick, ref } from 'vue';
import { describe, expect, it } from 'vitest';
import { useDialogFocus } from '../useDialogFocus';

const Harness = defineComponent({
  setup() {
    const open = ref(false);
    const dialog = ref<HTMLElement>();
    const { handleDialogKeydown } = useDialogFocus(open, dialog);
    return { open, dialog, handleDialogKeydown };
  },
  template: `
    <button class="trigger" @click="open = true">Открыть</button>
    <section v-if="open" ref="dialog" role="dialog" tabindex="-1" @keydown="handleDialogKeydown">
      <button class="first">Первый</button>
      <button class="last" @click="open = false">Последний</button>
    </section>
  `,
});

describe('useDialogFocus', () => {
  it('traps Tab inside the dialog and returns focus to the trigger', async () => {
    const wrapper = mount(Harness, { attachTo: document.body });
    const trigger = wrapper.get<HTMLButtonElement>('.trigger');
    trigger.element.focus();
    await trigger.trigger('click');
    await nextTick();

    const first = wrapper.get<HTMLButtonElement>('.first');
    const last = wrapper.get<HTMLButtonElement>('.last');
    expect(document.activeElement).toBe(first.element);

    last.element.focus();
    await last.trigger('keydown', { key: 'Tab' });
    expect(document.activeElement).toBe(first.element);

    first.element.focus();
    await first.trigger('keydown', { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last.element);

    await last.trigger('click');
    await nextTick();
    expect(document.activeElement).toBe(trigger.element);
    wrapper.unmount();
  });
});
