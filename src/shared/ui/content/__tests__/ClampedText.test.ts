// @vitest-environment happy-dom

import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ClampedText from '../ClampedText.vue';

let resizeCallback: ResizeObserverCallback;

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: ResizeObserverCallback) {
        resizeCallback = callback;
      }
      observe() {}
      disconnect() {}
    },
  );
});

function setHeights(element: Element, clientHeight: number, scrollHeight: number) {
  Object.defineProperties(element, {
    clientHeight: { configurable: true, value: clientHeight },
    scrollHeight: { configurable: true, value: scrollHeight },
  });
}

async function triggerResize() {
  await flushPromises();
  resizeCallback([], {} as ResizeObserver);
}

describe('ClampedText', () => {
  it('shows the disclosure only for measured overflow and toggles both states', async () => {
    const wrapper = mount(ClampedText, { props: { text: 'Длинная заметка', contentId: 'note-1' } });
    const paragraph = wrapper.get('p');

    setHeights(paragraph.element, 80, 80);
    await triggerResize();
    expect(wrapper.find('button').exists()).toBe(false);

    setHeights(paragraph.element, 80, 140);
    await triggerResize();
    const toggle = wrapper.get('button');
    expect(toggle.text()).toBe('Показать полностью');
    expect(toggle.attributes('aria-expanded')).toBe('false');

    await toggle.trigger('click');
    expect(paragraph.classes()).not.toContain('clamped-text--collapsed');
    expect(toggle.text()).toBe('Свернуть');

    await toggle.trigger('click');
    expect(paragraph.classes()).toContain('clamped-text--collapsed');
  });

  it('recalculates when content changes', async () => {
    const wrapper = mount(ClampedText, { props: { text: 'Старая заметка', contentId: 'note-2' } });
    const paragraph = wrapper.get('p');
    setHeights(paragraph.element, 80, 140);
    await triggerResize();
    expect(wrapper.find('button').exists()).toBe(true);

    setHeights(paragraph.element, 80, 80);
    await wrapper.setProps({ text: 'Короткая заметка' });
    expect(wrapper.find('button').exists()).toBe(false);

    setHeights(paragraph.element, 80, 140);
    await wrapper.setProps({ text: 'Новая длинная заметка' });
    await flushPromises();
    expect(wrapper.get('button').text()).toBe('Показать полностью');
  });
});
