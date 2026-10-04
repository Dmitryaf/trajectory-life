// @vitest-environment happy-dom

import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { notifyError, notifyInfo, notifyUnknownError } from '@/services/notifications';
import EventsView from '@/views/EventsView.vue';
import ResultsView from '@/views/ResultsView.vue';
import { createStore, routerLinkStub } from '../helpers/viewScenario';

vi.mock('@/services/notifications', () => ({
  notifyError: vi.fn(),
  notifyInfo: vi.fn(),
  notifySaved: vi.fn(),
  notifyUnknownError: vi.fn(),
}));

describe('journal scenarios', () => {
  it('opens the edit form, focuses its title and returns focus after cancel without changing the record', async () => {
    const { pinia, store } = createStore();
    store.results = [
      { id: 1, date: '2026-07-20', area: 'career', title: 'Прежняя запись', note: '', createdAt: '2026-07-20T10:00:00.000Z' },
    ];
    const wrapper = mount(ResultsView, { attachTo: document.body, global: { plugins: [pinia], stubs: { RouterLink: routerLinkStub } } });
    const edit = wrapper.get('[aria-label="Редактировать итог"]');
    (edit.element as HTMLButtonElement).focus();
    await edit.trigger('click');
    await flushPromises();
    const title = wrapper.get('.result-composer input[type="text"]');
    expect(wrapper.get('.archive-add').attributes('open')).toBeDefined();
    expect(document.activeElement).toBe(title.element);
    await title.setValue('Несохранённое изменение');
    await wrapper.get('.composer-cancel').trigger('click');
    await flushPromises();
    expect(wrapper.get('.archive-add').attributes('open')).toBeUndefined();
    expect(document.activeElement).toBe(edit.element);
    expect(store.results[0]!.title).toBe('Прежняя запись');
  });

  it('reports archive deletion errors and allows retrying the same record', async () => {
    const { pinia, store } = createStore();
    store.results = [{ id: 1, date: '2026-07-21', area: 'career', title: 'Итог', note: '', createdAt: '2026-07-21T10:00:00.000Z' }];
    store.lifeEvents = [{ id: 2, date: '2026-07-21', type: 'event', title: 'Событие', note: '', createdAt: '2026-07-21T11:00:00.000Z' }];
    const removeResult = vi
      .spyOn(store, 'removeResult')
      .mockRejectedValueOnce(new Error('IndexedDB unavailable'))
      .mockResolvedValueOnce(undefined);
    const removeLifeEvent = vi
      .spyOn(store, 'removeLifeEvent')
      .mockRejectedValueOnce(new Error('IndexedDB unavailable'))
      .mockResolvedValueOnce(undefined);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const global = { plugins: [pinia], stubs: { RouterLink: routerLinkStub } };
    const results = mount(ResultsView, { global });
    const events = mount(EventsView, { global });
    const resultButton = results.get('[aria-label="Удалить итог"]');
    const eventButton = events.get('[aria-label="Удалить событие"]');

    await resultButton.trigger('click');
    await eventButton.trigger('click');
    await flushPromises();
    expect(notifyUnknownError).toHaveBeenCalledWith(expect.any(Error), 'Не удалось удалить итог');
    expect(notifyUnknownError).toHaveBeenCalledWith(expect.any(Error), 'Не удалось удалить событие');
    expect(notifyInfo).not.toHaveBeenCalledWith('Итог удалён');
    expect(notifyInfo).not.toHaveBeenCalledWith('Событие удалено');
    expect(resultButton.attributes('disabled')).toBeUndefined();
    expect(eventButton.attributes('disabled')).toBeUndefined();

    await resultButton.trigger('click');
    await eventButton.trigger('click');
    await flushPromises();
    expect(removeResult).toHaveBeenCalledTimes(2);
    expect(removeLifeEvent).toHaveBeenCalledTimes(2);
    confirm.mockRestore();
  });

  it('uses bounded pages and resets pagination when archive filters change', async () => {
    const { pinia, store } = createStore();
    store.results = Array.from({ length: 9 }, (_, index) => ({
      id: index + 1,
      date: '2026-07-21',
      area: 'career' as const,
      title: `Итог ${index + 1}`,
      note: '',
      createdAt: `2026-07-21T${String(index + 10).padStart(2, '0')}:00:00.000Z`,
    }));
    const wrapper = mount(ResultsView, { global: { plugins: [pinia], stubs: { RouterLink: routerLinkStub } } });

    expect(wrapper.get('[aria-label="Страницы итогов"]').text()).toContain('1 из 2');
    expect(wrapper.text()).not.toContain('Итог 9');
    await wrapper.get('[aria-label="Страницы итогов"] button:last-child').trigger('click');
    expect(wrapper.get('[aria-label="Страницы итогов"]').text()).toContain('2 из 2');
    expect(wrapper.text()).toContain('Итог 9');

    await wrapper.get('[aria-label="Поиск по итогам"]').setValue('Итог 1');
    expect(wrapper.text()).toContain('Итог 1');
    expect(wrapper.find('[aria-label="Страницы итогов"]').exists()).toBe(false);
  });

  it('adds an outcome and filters the existing archive by text', async () => {
    const { pinia, store } = createStore();
    store.results = [
      {
        id: 3,
        date: '2026-07-21',
        area: 'career',
        title: 'Сегодняшний итог',
        note: 'Разобрался, почему откладывал эту задачу',
        createdAt: '2026-07-21T10:00:00.000Z',
      },
      { id: 1, date: '2026-07-20', area: 'reading', title: 'Дочитал книгу', note: '', createdAt: '2026-07-20T10:00:00.000Z' },
      { id: 2, date: '2026-07-19', area: 'career', title: 'Получил ответ', note: '', createdAt: '2026-07-19T10:00:00.000Z' },
    ];
    const addResult = vi.spyOn(store, 'addResult').mockResolvedValue(undefined);
    const wrapper = mount(ResultsView, { global: { plugins: [pinia], stubs: { RouterLink: routerLinkStub } } });

    expect(wrapper.text()).toContain('Сделанное дело или полученный результат.');
    expect(wrapper.get('[aria-label="Начальная дата итогов"]').element).toHaveProperty('value', '');
    expect(wrapper.get('[aria-label="Конечная дата итогов"]').element).toHaveProperty('value', '');
    expect(wrapper.text()).toContain('Сегодняшний итог');
    expect(wrapper.text()).toContain('Дочитал книгу');
    await wrapper.get('[aria-label="Конечная дата итогов"]').setValue('2026-07-21');
    const allTimeButton = wrapper.get('.archive-filter__all-time');
    expect(allTimeButton.attributes('disabled')).toBeUndefined();
    await allTimeButton.trigger('click');
    expect(wrapper.get('[aria-label="Начальная дата итогов"]').element).toHaveProperty('value', '');
    expect(wrapper.get('[aria-label="Конечная дата итогов"]').element).toHaveProperty('value', '');
    expect(wrapper.get('.archive-date-filter__state').text()).toBe('Показаны записи за всё время');
    expect(wrapper.get('.archive-filter__all-time').attributes('disabled')).toBeDefined();
    await wrapper.get('[aria-label="Поиск по итогам"]').setValue('откладывал');
    expect(wrapper.text()).toContain('Сегодняшний итог');
    await wrapper.get('[aria-label="Поиск по итогам"]').setValue('книгу');
    expect(wrapper.text()).toContain('Дочитал книгу');
    expect(wrapper.text()).not.toContain('Получил ответ');

    await wrapper.get('[aria-label="Поиск по итогам"]').setValue('');
    await wrapper.get('.result-composer input[type="text"]').setValue('Закончил курс');
    const note = wrapper.get('.result-composer textarea');
    await note.setValue('Собрал финальный проект и получил обратную связь');
    await note.setValue('');
    expect(note.element).toBeInstanceOf(HTMLTextAreaElement);
    await note.setValue('Собрал финальный проект и получил обратную связь');
    await wrapper.get('.result-composer .primary-button').trigger('click');
    await flushPromises();

    expect(addResult).toHaveBeenCalledWith({
      date: '2026-07-21',
      area: 'career',
      title: 'Закончил курс',
      note: 'Собрал финальный проект и получил обратную связь',
    });
  });

  it('does not send an outcome or event without a date to the store', async () => {
    const { pinia, store } = createStore();
    const addResult = vi.spyOn(store, 'addResult').mockResolvedValue(undefined);
    const addLifeEvent = vi.spyOn(store, 'addLifeEvent').mockResolvedValue(undefined);
    const global = { plugins: [pinia], stubs: { RouterLink: routerLinkStub } };
    const results = mount(ResultsView, { global });
    const events = mount(EventsView, { global });

    await results.get('.result-composer input[type="text"]').setValue('Итог без даты');
    await results.get('[aria-label="Дата итога"]').setValue('');
    await results.get('.result-composer input[type="text"]').trigger('keydown.enter');
    await events.get('.result-composer input[type="text"]').setValue('Событие без даты');
    await events.get('[aria-label="Дата события"]').setValue('');
    await events.get('.result-composer input[type="text"]').trigger('keydown.enter');

    expect(addResult).not.toHaveBeenCalled();
    expect(addLifeEvent).not.toHaveBeenCalled();
    expect(notifyError).toHaveBeenCalledWith('Укажите дату итога');
    expect(notifyError).toHaveBeenCalledWith('Укажите дату события');
    expect(results.get('.result-composer .primary-button').attributes('disabled')).toBeDefined();
    expect(events.get('.result-composer .primary-button').attributes('disabled')).toBeDefined();
  });

  it('shows an archived custom result area while editing the record that uses it', async () => {
    const { pinia, store } = createStore();
    store.settings.customLifeAreaOptions = [{ id: 'custom:life:archived', label: 'Старая область', archived: true }];
    store.results = [
      {
        id: 1,
        date: '2026-07-21',
        area: 'custom:life:archived',
        title: 'Исторический итог',
        note: '',
        createdAt: '2026-07-21T10:00:00.000Z',
      },
    ];
    const wrapper = mount(ResultsView, { global: { plugins: [pinia], stubs: { RouterLink: routerLinkStub } } });

    await wrapper.get('[aria-label="Редактировать итог"]').trigger('click');

    const archivedArea = wrapper.findAll('.result-composer .chip').find((chip) => chip.text().includes('Старая область'));
    expect(archivedArea).toBeDefined();
    expect(archivedArea!.attributes('aria-pressed')).toBe('true');
  });

  it('adds an insight and finds an event by its note', async () => {
    const { pinia, store } = createStore();
    const longNote = 'Длинная мысль может объединять несколько связанных тем без обязательного разбиения. '.repeat(8).trim();
    store.lifeEvents = [
      { id: 3, date: '2026-07-21', type: 'decision', title: 'Сегодняшнее решение', note: '', createdAt: '2026-07-21T10:00:00.000Z' },
      { id: 4, date: '2026-07-21', type: 'insight', title: 'Развёрнутый инсайт', note: longNote, createdAt: '2026-07-21T11:00:00.000Z' },
      {
        id: 1,
        date: '2026-07-20',
        type: 'insight',
        title: 'Наблюдение',
        note: 'Лучше думаю после прогулки',
        createdAt: '2026-07-20T10:00:00.000Z',
      },
      { id: 2, date: '2026-07-19', type: 'event', title: 'Встреча', note: 'Обсудили планы', createdAt: '2026-07-19T10:00:00.000Z' },
    ];
    const addLifeEvent = vi.spyOn(store, 'addLifeEvent').mockResolvedValue(undefined);
    const wrapper = mount(EventsView, { global: { plugins: [pinia], stubs: { RouterLink: routerLinkStub } } });

    expect(wrapper.text()).toContain('Важная ситуация, мысль или деталь дня.');
    expect(wrapper.get('[aria-label="Начальная дата событий"]').element).toHaveProperty('value', '');
    expect(wrapper.get('[aria-label="Конечная дата событий"]').element).toHaveProperty('value', '');
    expect(wrapper.text()).toContain('Сегодняшнее решение');
    expect(wrapper.text()).toContain('Наблюдение');
    const longNoteParagraph = wrapper.get('.timeline-item__note');
    expect(longNoteParagraph.text()).toBe(longNote);
    expect(longNoteParagraph.classes()).toContain('clamped-text--collapsed');
    await wrapper.get('.archive-filter__all-time').trigger('click');
    await wrapper.get('[aria-label="Поиск по событиям"]').setValue('прогулки');
    expect(wrapper.text()).toContain('Наблюдение');
    expect(wrapper.text()).not.toContain('Встреча');

    await wrapper.get('[aria-label="Поиск по событиям"]').setValue('');
    const insightChoice = wrapper.findAll('.result-composer .chip').find((chip) => chip.text().includes('Мысль или наблюдение'));
    expect(insightChoice).toBeDefined();
    await insightChoice!.trigger('click');
    await wrapper.get('.result-composer input[type="text"]').setValue('Понял причину усталости');
    await wrapper.get('.result-composer textarea').setValue(longNote);
    await wrapper.get('.result-composer .primary-button').trigger('click');
    await flushPromises();

    expect(addLifeEvent).toHaveBeenCalledWith({
      date: '2026-07-21',
      type: 'insight',
      title: 'Понял причину усталости',
      note: longNote,
    });
  });
});
