// @vitest-environment happy-dom

import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { copyAiPrompt } from '@/features/export/browser';
import { notifyUnknownError } from '@/services/notifications';
import { emptyDailyEntry, emptyMonthlyReview, emptyWeeklyReview } from '@/types';
import MonthView from '@/views/MonthView.vue';
import TrendsView from '@/views/TrendsView.vue';
import WeekView from '@/views/WeekView.vue';
import { createStore, routerLinkStub } from '../helpers/viewScenario';
import { hasUnsavedSyncEditors } from '@/features/sync/editing';

const emittedTelemetry = vi.hoisted(() => vi.fn());
vi.mock('@/features/telemetry/productTelemetry', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/telemetry/productTelemetry')>()),
  captureProductEvent: (name: string, props: unknown) => () => emittedTelemetry(name, props),
}));

vi.mock('@/services/notifications', () => ({
  notifyError: vi.fn(),
  notifyInfo: vi.fn(),
  notifySaved: vi.fn(),
  notifyUnknownError: vi.fn(),
}));

vi.mock('@/features/export/browser', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/export/browser')>()),
  copyAiPrompt: vi.fn(),
}));

describe('period review navigation', () => {
  it.each(['week', 'month'] as const)('refreshes a clean %s review and preserves a dirty form after a remote change', async (period) => {
    const { pinia, store } = createStore();
    const weekReview = { ...emptyWeeklyReview('2026-07-20'), nextLever: 'original' };
    const monthReview = { ...emptyMonthlyReview('2026-07-01'), nextFocus: 'original' };
    store.weeklyReviews = [weekReview];
    store.monthlyReviews = [monthReview];
    const wrapper = mount(period === 'week' ? WeekView : MonthView, {
      global: { plugins: [pinia], stubs: { EChartPanel: true, RouterLink: routerLinkStub } },
    });
    const input = wrapper.get(
      period === 'week'
        ? 'textarea[placeholder="Можно продолжить как есть или пока ничего не решать"]'
        : 'textarea[placeholder="Что стоит продолжить, изменить или проверить"]',
    );
    const changeRemote = (text: string) => {
      if (period === 'week') {
        store.weeklyReviews = [{ ...weekReview, nextLever: text }];
      } else {
        store.monthlyReviews = [{ ...monthReview, nextFocus: text }];
      }
    };
    expect(hasUnsavedSyncEditors()).toBe(false);
    changeRemote('remote clean');
    await flushPromises();
    expect((input.element as HTMLTextAreaElement).value).toBe('remote clean');
    await input.setValue('my unsaved text');
    expect(hasUnsavedSyncEditors()).toBe(true);
    changeRemote('remote conflicting');
    await flushPromises();
    expect((input.element as HTMLTextAreaElement).value).toBe('my unsaved text');
    expect(wrapper.get('.review-conflict').text()).toContain('Обзор изменился');
    expect(wrapper.get(`#${period}-review > .primary-button`).attributes('disabled')).toBeDefined();
    await wrapper.get('.review-conflict button').trigger('click');
    expect((input.element as HTMLTextAreaElement).value).toBe('remote conflicting');
    expect(hasUnsavedSyncEditors()).toBe(false);
    await input.setValue('another draft');
    wrapper.unmount();
    expect(hasUnsavedSyncEditors()).toBe(false);
  });

  it('keeps changes typed during review saving dirty and saves them on the next attempt', async () => {
    const { pinia, store } = createStore();
    const initial = { ...emptyWeeklyReview('2026-07-20'), nextLever: 'original' };
    store.weeklyReviews = [initial];
    let complete!: () => void;
    vi.spyOn(store, 'saveReview')
      .mockImplementationOnce(async (review) => {
        await new Promise<void>((resolve) => {
          complete = resolve;
        });
        store.weeklyReviews = [{ ...review, updatedAt: '2026-07-21T00:00:00.000Z' }];
      })
      .mockImplementationOnce(async (review) => {
        store.weeklyReviews = [review];
      });
    const wrapper = mount(WeekView, { global: { plugins: [pinia], stubs: { EChartPanel: true, RouterLink: routerLinkStub } } });
    const input = wrapper.get('textarea[placeholder="Можно продолжить как есть или пока ничего не решать"]');
    await input.setValue('first edit');
    await wrapper.get('#week-review > .primary-button').trigger('click');
    await input.setValue('newer edit');
    complete();
    await flushPromises();
    expect((input.element as HTMLTextAreaElement).value).toBe('newer edit');
    expect(hasUnsavedSyncEditors()).toBe(true);
    await wrapper.get('#week-review > .primary-button').trigger('click');
    await flushPromises();
    expect(store.weeklyReviews[0]?.nextLever).toBe('newer edit');
    expect(hasUnsavedSyncEditors()).toBe(false);
  });

  it('replaces a changed review only after the explicit choice to keep the form version', async () => {
    const { pinia, store } = createStore();
    const initial = { ...emptyWeeklyReview('2026-07-20'), nextLever: 'original' };
    const remote = { ...initial, nextLever: 'remote version' };
    store.weeklyReviews = [initial];
    const persist = vi.spyOn(store, 'saveReview').mockImplementation(async (review) => {
      store.weeklyReviews = [review];
    });
    const wrapper = mount(WeekView, { global: { plugins: [pinia], stubs: { EChartPanel: true, RouterLink: routerLinkStub } } });
    const input = wrapper.get('textarea[placeholder="Можно продолжить как есть или пока ничего не решать"]');
    await input.setValue('my version');
    store.weeklyReviews = [remote];
    await flushPromises();
    expect(persist).not.toHaveBeenCalled();
    await wrapper.findAll('.review-conflict button')[1]!.trigger('click');
    await flushPromises();
    expect(persist).toHaveBeenCalledWith(expect.objectContaining({ nextLever: 'my version' }), remote);
    expect(wrapper.find('.review-conflict').exists()).toBe(false);
    expect(hasUnsavedSyncEditors()).toBe(false);
  });

  it('keeps review drafts available after a failed save and allows retrying', async () => {
    const { pinia, store } = createStore();
    store.weeklyReviews = [{ ...emptyWeeklyReview('2026-07-20'), results: ['Черновик недели', '', ''] }];
    store.monthlyReviews = [{ ...emptyMonthlyReview('2026-07-01'), mainPattern: 'Черновик месяца' }];
    const saveReview = vi
      .spyOn(store, 'saveReview')
      .mockRejectedValueOnce(new Error('IndexedDB unavailable'))
      .mockResolvedValueOnce(undefined);
    const saveMonthlyReview = vi
      .spyOn(store, 'saveMonthlyReview')
      .mockRejectedValueOnce(new Error('IndexedDB unavailable'))
      .mockResolvedValueOnce(undefined);
    const global = { plugins: [pinia], stubs: { EChartPanel: true, RouterLink: routerLinkStub } };
    const week = mount(WeekView, { global });
    const month = mount(MonthView, { global });
    const weekButton = week.get('#week-review .primary-button');
    const monthButton = month.get('#month-review .primary-button');

    await weekButton.trigger('click');
    await monthButton.trigger('click');
    await flushPromises();

    expect(emittedTelemetry).not.toHaveBeenCalled();
    expect(notifyUnknownError).toHaveBeenCalledWith(expect.any(Error), 'Не удалось сохранить обзор недели');
    expect(notifyUnknownError).toHaveBeenCalledWith(expect.any(Error), 'Не удалось сохранить итог месяца');
    expect((week.get('#week-review input').element as HTMLInputElement).value).toBe('Черновик недели');
    expect((month.get('#month-review textarea').element as HTMLTextAreaElement).value).toBe('Черновик месяца');
    expect(weekButton.attributes('disabled')).toBeUndefined();
    expect(monthButton.attributes('disabled')).toBeUndefined();

    await weekButton.trigger('click');
    await monthButton.trigger('click');
    await flushPromises();
    expect(saveReview).toHaveBeenCalledTimes(2);
    expect(saveMonthlyReview).toHaveBeenCalledTimes(2);
    expect(emittedTelemetry).toHaveBeenCalledWith('week_review_saved', { save_kind: 'updated' });
    expect(emittedTelemetry).toHaveBeenCalledWith('month_review_saved', { save_kind: 'updated' });
  });

  it('blocks repeated prompt copying in weekly and monthly reviews', async () => {
    const { pinia, store } = createStore();
    store.dailyEntries = [{ ...emptyDailyEntry('2026-07-21'), importantFact: 'Есть данные для анализа' }];
    let finishWeekCopy!: () => void;
    let finishMonthCopy!: () => void;
    vi.mocked(copyAiPrompt)
      .mockReturnValueOnce(
        new Promise<void>((resolve) => {
          finishWeekCopy = resolve;
        }),
      )
      .mockReturnValueOnce(
        new Promise<void>((resolve) => {
          finishMonthCopy = resolve;
        }),
      );
    const global = { plugins: [pinia], stubs: { EChartPanel: true, RouterLink: routerLinkStub } };
    const week = mount(WeekView, { global });
    const month = mount(MonthView, { global });
    const weekButton = week.findAll('button').find((button) => button.text() === 'Скопировать текст для нейросети')!;
    const monthButton = month.findAll('button').find((button) => button.text() === 'Скопировать текст для нейросети')!;

    for (const wrapper of [week, month]) {
      const customPeriodLink = wrapper.get('.range-custom-action a');
      expect(wrapper.get('.range-custom-action strong').text()).toBe('Данные для анализа за другие даты');
      expect(customPeriodLink.text()).toBe('Перейти к экспорту');
      expect(customPeriodLink.attributes('href')).toBe('/settings#analysis-settings');
    }

    await weekButton.trigger('click');
    await weekButton.trigger('click');
    await monthButton.trigger('click');
    await monthButton.trigger('click');

    expect(copyAiPrompt).toHaveBeenCalledTimes(2);
    expect(weekButton.text()).toBe('Скопировать текст для нейросети');
    expect(monthButton.text()).toBe('Скопировать текст для нейросети');
    expect(weekButton.attributes('aria-busy')).toBe('true');
    expect(monthButton.attributes('aria-busy')).toBe('true');
    expect(weekButton.attributes('disabled')).toBeDefined();
    expect(monthButton.attributes('disabled')).toBeDefined();

    finishWeekCopy();
    finishMonthCopy();
    await flushPromises();

    expect(weekButton.text()).toBe('Скопировать текст для нейросети');
    expect(monthButton.text()).toBe('Скопировать текст для нейросети');
    expect(weekButton.attributes('disabled')).toBeUndefined();
    expect(monthButton.attributes('disabled')).toBeUndefined();
  });

  it('keeps long experiments compact and pages their daily notes inside the matching experiment', async () => {
    const { pinia, store } = createStore();
    const completed = { ...store.settings.experiment, title: 'Завтрак без телефона', startDate: '2026-07-19', endDate: '2026-07-20' };
    const { active: _active, ...completedRecord } = completed;
    store.settings.experiment = {
      ...store.settings.experiment,
      id: 'active-important-action',
      active: true,
      title: 'Каждый день начинать важное действие, даже если условие эксперимента занимает несколько строк '.repeat(4),
      hypothesis: 'Станет ли легче начинать без ожидания подходящего состояния',
      startDate: '2026-07-21',
      endDate: '2026-07-26',
    };
    store.settings.experimentHistory = [
      {
        ...completedRecord,
        conclusion: 'Телефон влиял меньше, чем ожидалось',
        decision: 'stop',
        id: 'completed-breakfast',
        completedAt: '2026-07-20T20:00:00.000Z',
      },
    ];
    store.dailyEntries = [
      {
        ...emptyDailyEntry('2026-07-20'),
        importantFact: 'Есть запись',
        experimentId: 'completed-breakfast',
        experimentCompleted: true,
        experimentNote: 'Заранее оставил телефон в другой комнате',
      },
      {
        ...emptyDailyEntry('2026-07-21'),
        importantFact: 'Есть запись',
        experimentId: 'active-important-action',
        experimentCompleted: false,
        experimentNote: 'Долго выбирал первое действие',
      },
      {
        ...emptyDailyEntry('2026-07-22'),
        importantFact: 'Есть запись',
        experimentId: 'active-important-action',
        experimentCompleted: true,
        experimentNote: 'Подготовил задачу с вечера',
      },
    ];
    const wrapper = mount(WeekView, {
      global: { plugins: [pinia], stubs: { EChartPanel: true, RouterLink: routerLinkStub } },
    });
    let cards = wrapper.findAll('.experiment-period-card');

    expect(cards).toHaveLength(2);
    expect(cards[0]!.attributes('open')).toBeDefined();
    expect(cards[1]!.attributes('open')).toBeUndefined();
    expect(cards[0]!.get('summary strong').text().endsWith('…')).toBe(true);
    expect(cards[0]!.text()).toContain('Заметки этой недели · 2');
    expect(cards[0]!.find('.experiment-note-page').exists()).toBe(false);

    await cards[0]!
      .findAll('button')
      .find((button) => button.text() === 'Заметки этой недели · 2')!
      .trigger('click');
    expect(cards[0]!.get('.experiment-note-page').text()).toContain('Долго выбирал первое действие');
    expect(cards[0]!.get('.experiment-note-page').text()).toContain('1 из 2');

    await cards[0]!.get('[aria-label="Страницы заметок эксперимента"] button:last-child').trigger('click');
    expect(cards[0]!.get('.experiment-note-page').text()).toContain('Подготовил задачу с вечера');

    (cards[1]!.element as HTMLDetailsElement).open = true;
    await cards[1]!.trigger('toggle');
    await flushPromises();
    cards = wrapper.findAll('.experiment-period-card');
    expect(cards[0]!.attributes('open')).toBeUndefined();
    expect(cards[1]!.attributes('open')).toBeDefined();
    expect(cards[1]!.text()).toContain('Телефон влиял меньше, чем ожидалось');
    expect(cards[1]!.text()).toContain('Заметки этой недели · 1');
  });

  it('shows one cross-week experiment as clearly scoped weekly slices with one stable identity', () => {
    const { pinia, store } = createStore();
    store.settings.experiment = {
      ...store.settings.experiment,
      id: 'cross-week-experiment',
      active: true,
      title: 'Начинать важное действие сразу',
      startDate: '2026-07-16',
      endDate: '2026-07-27',
    };
    store.dailyEntries = [
      {
        ...emptyDailyEntry('2026-07-17'),
        experimentId: 'cross-week-experiment',
        experimentCompleted: true,
        experimentNote: 'Подготовил задачу заранее',
      },
      {
        ...emptyDailyEntry('2026-07-18'),
        experimentId: 'cross-week-experiment',
        experimentCompleted: false,
      },
      {
        ...emptyDailyEntry('2026-07-21'),
        experimentId: 'cross-week-experiment',
        experimentCompleted: true,
        experimentNote: 'Начал без долгой подготовки',
      },
    ];
    const global = { plugins: [pinia], stubs: { EChartPanel: true, RouterLink: routerLinkStub } };

    const currentWeek = mount(WeekView, { global });
    expect(currentWeek.find('.period-empty-guide').exists()).toBe(false);
    expect((currentWeek.get('details.week-data-details').element as HTMLDetailsElement).open).toBe(false);
    const currentCard = currentWeek.get('.experiment-period-card');
    expect(currentCard.text()).toContain('Идёт сейчас');
    expect(currentCard.text()).toContain('Период: 16 июл. — 27 июл.');
    expect(currentCard.get('[aria-label="Отметки эксперимента за эту неделю"]').text()).toContain('За неделю: получилось · 1');
    expect(currentCard.get('[aria-label="Отметки эксперимента за эту неделю"]').text()).toContain('Без отметки · 6 из 7');
    expect(currentCard.text()).toContain('За весь период: получилось 2, не получилось 1, без отметки 9 из 12');
    expect(currentCard.text()).toContain('Заметки этой недели · 1');

    const previousWeek = mount(WeekView, { props: { initialWeek: '2026-07-13' }, global });
    const previousCard = previousWeek.get('.experiment-period-card');
    expect(previousCard.text()).toContain('Шёл в эту неделю');
    expect(previousCard.get('[aria-label="Отметки эксперимента за эту неделю"]').text()).toContain('За неделю: получилось · 1');
    expect(previousCard.get('[aria-label="Отметки эксперимента за эту неделю"]').text()).toContain('Не получилось · 1');
    expect(previousCard.get('[aria-label="Отметки эксперимента за эту неделю"]').text()).toContain('Без отметки · 2 из 4');
    expect(previousCard.text()).toContain('Заметки этой недели · 1');
  });

  it('keeps weekly and monthly results and events in matching bounded pages', async () => {
    const { pinia, store } = createStore();
    store.dailyEntries = [{ ...emptyDailyEntry('2026-07-21'), importantFact: 'Есть данные недели' }];
    store.results = Array.from({ length: 6 }, (_, index) => ({
      id: index + 1,
      date: '2026-07-21',
      area: index === 0 ? ('sleep' as const) : ('career' as const),
      title: `Итог периода ${index + 1}`,
      note: '',
      createdAt: `2026-07-21T${String(12 + index).padStart(2, '0')}:00:00.000Z`,
    }));
    store.lifeEvents = Array.from({ length: 6 }, (_, index) => ({
      id: index + 1,
      date: '2026-07-21',
      type: 'event' as const,
      title: `Событие периода ${index + 1}`,
      note: '',
      createdAt: `2026-07-21T${String(12 + index).padStart(2, '0')}:00:00.000Z`,
    }));
    const global = { plugins: [pinia], stubs: { EChartPanel: true, RouterLink: routerLinkStub } };
    const periods = [
      { wrapper: mount(WeekView, { global }), label: 'недели' },
      { wrapper: mount(MonthView, { global }), label: 'месяца' },
    ];

    for (const { wrapper, label } of periods) {
      expect(wrapper.text()).not.toContain('Открыть все итоги');
      expect(wrapper.text()).not.toContain('Открыть все события');
      expect(wrapper.text()).toContain('Итог периода 5');
      expect(wrapper.text()).not.toContain('Итог периода 6');
      expect(wrapper.text()).toContain('Событие периода 5');
      expect(wrapper.text()).not.toContain('Событие периода 6');

      const resultCard = wrapper.findAll('article.period-record-card').find((card) => card.text().includes(`Итоги ${label}`))!;
      expect(resultCard.get('.period-record-preview li > span').text()).toBe('◒');

      const resultPages = wrapper.get(`nav[aria-label="Страницы итогов ${label}"]`);
      const eventPages = wrapper.get(`nav[aria-label="Страницы событий ${label}"]`);
      expect(resultPages.text()).toContain('1 из 2');
      expect(eventPages.text()).toContain('1 из 2');

      await resultPages.get('button:last-child').trigger('click');
      await eventPages.get('button:last-child').trigger('click');

      expect(wrapper.text()).not.toContain('Итог периода 5');
      expect(wrapper.text()).toContain('Итог периода 6');
      expect(wrapper.text()).not.toContain('Событие периода 5');
      expect(wrapper.text()).toContain('Событие периода 6');
    }
  });

  it('keeps manually opened review context visible after its draft is cleared', async () => {
    const { pinia, store } = createStore();
    store.weeklyReviews = [emptyWeeklyReview('2026-07-20')];
    store.monthlyReviews = [emptyMonthlyReview('2026-07-01')];
    const global = { plugins: [pinia], stubs: { EChartPanel: true, RouterLink: routerLinkStub } };
    const cases = [
      { details: mount(WeekView, { global }).get('details.review-context-details'), field: 'input' },
      { details: mount(MonthView, { global }).get('details.month-review-context'), field: 'textarea' },
    ];

    for (const { details, field } of cases) {
      expect((details.element as HTMLDetailsElement).open).toBe(false);
      await details.get('summary').trigger('click');
      expect((details.element as HTMLDetailsElement).open).toBe(true);

      await details.get(field).setValue('Черновик');
      await details.get(field).setValue('');

      expect((details.element as HTMLDetailsElement).open).toBe(true);
    }
  });

  it('keeps weekly observations and daily context before reflection and retains the week map', () => {
    const { pinia, store } = createStore();
    store.dailyEntries = Array.from({ length: 5 }, (_, index) => ({
      ...emptyDailyEntry(`2026-07-${String(20 + index).padStart(2, '0')}`),
      recordedFields: ['sleepMinutes', 'energy', 'actionDirection', 'importantFact'],
      sleepMinutes: 390,
      energy: 3,
      actionDirection: 'preparation' as const,
      importantFact: `Факт ${index + 1}`,
    }));
    store.results = [
      {
        id: 1,
        date: '2026-07-22',
        area: 'career',
        title: 'Завершённый итог',
        note: '',
        createdAt: '2026-07-22T12:00:00.000Z',
      },
    ];
    store.lifeEvents = [
      {
        id: 1,
        date: '2026-07-23',
        type: 'event',
        title: 'Важное событие',
        note: '',
        createdAt: '2026-07-23T12:00:00.000Z',
      },
    ];
    store.weeklyReviews = [emptyWeeklyReview('2026-07-20')];
    const wrapper = mount(WeekView, { global: { plugins: [pinia], stubs: { EChartPanel: true, RouterLink: routerLinkStub } } });

    const review = wrapper.get('#week-review');
    const details = wrapper.get('details.week-data-details');
    const records = wrapper.get('.period-records--featured');
    const observations = wrapper.get('.period-analysis-card:not(#ai-analysis)');
    const externalAnalysis = wrapper.get('#ai-analysis');
    const reviewContext = review.get('details.review-context-details');
    expect(records.element.compareDocumentPosition(observations.element) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(observations.element.compareDocumentPosition(review.element) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(review.element.compareDocumentPosition(externalAnalysis.element) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(observations.element.compareDocumentPosition(details.element) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(details.element.compareDocumentPosition(review.element) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(observations.find('.period-actions').exists()).toBe(false);
    expect(externalAnalysis.find('.review-cue-grid').exists()).toBe(false);
    expect(wrapper.findAll('.review-cue-grid--primary .review-cue')).toHaveLength(3);
    expect(wrapper.find('.review-cue-grid--additional').exists()).toBe(false);
    expect((reviewContext.element as HTMLDetailsElement).open).toBe(false);
    expect(reviewContext.get('summary').text()).toBe('Добавить дела и события');
    expect(
      (review.get('textarea[placeholder="Можно продолжить как есть или пока ничего не решать"]').element as HTMLTextAreaElement).value,
    ).toBe('');
    expect((details.element as HTMLDetailsElement).open).toBe(false);
    expect(details.get('summary').text()).toBe('Показать записи по дням');
    expect(details.find('.metrics-grid').exists()).toBe(false);
    expect(details.find('.week-story-list').exists()).toBe(true);
    expect(details.find('.heatmap').exists()).toBe(true);
    expect(details.find('e-chart-panel-stub').exists()).toBe(false);
  });

  it('shows sparse weekly data as a compact day story without a graph', () => {
    const { pinia, store } = createStore();
    store.dailyEntries = [
      {
        ...emptyDailyEntry('2026-07-21'),
        recordedFields: ['sleepMinutes', 'energy', 'importantFact'],
        sleepMinutes: 420,
        energy: 3,
        importantFact: 'Одна заполненная запись',
      },
    ];
    const wrapper = mount(WeekView, { global: { plugins: [pinia], stubs: { EChartPanel: true, RouterLink: routerLinkStub } } });
    const details = wrapper.get('details.week-data-details');

    expect(details.get('.week-story-list').text()).toContain('Одна заполненная запись');
    expect(details.findAll('.week-story-day')).toHaveLength(7);
    expect(details.find('e-chart-panel-stub').exists()).toBe(false);
  });

  it('keeps the monthly decision before detailed analytics and compares filled weeks', () => {
    const { pinia, store } = createStore();
    store.dailyEntries = Array.from({ length: 14 }, (_, index) => ({
      ...emptyDailyEntry('2026-07-' + String(index + 1).padStart(2, '0')),
      recordedFields: ['sleepMinutes', 'energy', 'actionDirection', 'importantFact'],
      sleepMinutes: 390 + Math.floor(index / 7) * 30,
      energy: 2 + Math.floor(index / 7),
      actionDirection: 'external' as const,
      importantFact: 'Факт месяца ' + (index + 1),
    }));
    store.lifeEvents = [
      {
        id: 1,
        date: '2026-07-10',
        type: 'event',
        title: 'Событие, которое изменило месяц',
        note: '',
        createdAt: '2026-07-10T12:00:00.000Z',
      },
    ];
    store.monthlyReviews = [emptyMonthlyReview('2026-07-01')];
    const wrapper = mount(MonthView, { global: { plugins: [pinia], stubs: { EChartPanel: true, RouterLink: routerLinkStub } } });

    const review = wrapper.get('#month-review');
    const analysis = wrapper.get('details.month-analysis-details');
    const records = wrapper.get('.period-records--featured');
    const reviewContext = review.get('details.month-review-context');
    expect(review.element.compareDocumentPosition(analysis.element) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(records.element.compareDocumentPosition(review.element) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(wrapper.findAll('.month-week-overview .month-week-story > article').length).toBeGreaterThanOrEqual(2);
    expect(wrapper.findAll('.review-cue-grid--primary .review-cue')).toHaveLength(3);
    expect(wrapper.find('.month-featured-events').exists()).toBe(false);
    expect(records.text()).toContain('Событие, которое изменило месяц');
    expect((reviewContext.element as HTMLDetailsElement).open).toBe(false);
    expect(reviewContext.get('summary').text()).toBe('Добавить разбор месяца');
    expect(wrapper.find('.month-facts-details').exists()).toBe(false);
    expect(wrapper.find('.metrics-grid').exists()).toBe(false);
    expect(wrapper.find('.month-calendar').exists()).toBe(false);
    expect((analysis.element as HTMLDetailsElement).open).toBe(false);
    expect(analysis.find('.month-chart-guide').exists()).toBe(false);
    expect(analysis.findAll('e-chart-panel-stub')).toHaveLength(1);
    expect(analysis.text()).toContain('Области жизни');
    expect(analysis.find('.review-cue-grid--additional').exists()).toBe(false);
    expect(analysis.text()).not.toContain('Другие наблюдения и вопросы');
  });

  it('explains why monthly graphs are hidden when comparable data is scarce', () => {
    const { pinia, store } = createStore();
    store.dailyEntries = [
      {
        ...emptyDailyEntry('2026-07-21'),
        recordedFields: ['sleepMinutes', 'energy', 'importantFact'],
        sleepMinutes: 420,
        energy: 3,
        importantFact: 'Одна запись месяца',
      },
    ];
    const wrapper = mount(MonthView, { global: { plugins: [pinia], stubs: { EChartPanel: true, RouterLink: routerLinkStub } } });
    const analysis = wrapper.get('details.month-analysis-details');

    expect(wrapper.get('.month-week-overview').text()).toContain('Для сравнения нужны записи хотя бы за две недели');
    expect(analysis.get('.month-chart-guide').text()).toContain('Для графика пока мало данных');
    expect(analysis.get('.month-chart-guide').text()).toContain('сон — 1, энергия — 1, вес — 0');
    expect(analysis.find('e-chart-panel-stub').exists()).toBe(false);
  });

  it('shows the monthly weight graph from the first measurement', () => {
    const { pinia, store } = createStore();
    store.dailyEntries = [
      {
        ...emptyDailyEntry('2026-07-21'),
        recordedFields: ['weightKg', 'importantFact'],
        weightKg: 81.4,
        importantFact: 'Первое измерение веса за месяц',
      },
    ];
    const wrapper = mount(MonthView, { global: { plugins: [pinia], stubs: { EChartPanel: true, RouterLink: routerLinkStub } } });
    const analysis = wrapper.get('details.month-analysis-details');

    expect(analysis.get('.metric-switcher').text()).toContain('Вес');
    expect(analysis.get('.month-metric-card').text()).toContain('1 изм.');
    expect(analysis.findAll('e-chart-panel-stub')).toHaveLength(1);
    expect(analysis.find('.month-chart-guide').exists()).toBe(false);
  });

  it('keeps monthly record groups together and paginates detailed notes', async () => {
    const { pinia, store } = createStore();
    store.dailyEntries = Array.from({ length: 9 }, (_, index) => {
      const day = String(21 - index).padStart(2, '0');
      return {
        ...emptyDailyEntry(`2026-07-${day}`),
        actionDirection: index % 2 === 0 ? 'preparation' : 'external',
        actionNote: `Действие ${index + 1}`,
        contextNote: `Контекст ${index + 1}`,
      };
    });
    store.results = Array.from({ length: 4 }, (_, index) => ({
      id: index + 1,
      date: `2026-07-${String(21 - index).padStart(2, '0')}`,
      area: 'career' as const,
      title: `Обзор месяца ${index + 1}`,
      note: '',
      createdAt: `2026-07-${String(21 - index).padStart(2, '0')}T12:00:00.000Z`,
    }));
    store.lifeEvents = Array.from({ length: 4 }, (_, index) => ({
      id: index + 1,
      date: `2026-07-${String(21 - index).padStart(2, '0')}`,
      type: 'event' as const,
      title: `Событие месяца ${index + 1}`,
      note: '',
      createdAt: `2026-07-${String(21 - index).padStart(2, '0')}T12:00:00.000Z`,
    }));
    const wrapper = mount(MonthView, { global: { plugins: [pinia], stubs: { EChartPanel: true, RouterLink: routerLinkStub } } });

    expect(wrapper.text()).toContain('Показать графики и сравнения');
    expect(wrapper.text()).toContain('Показать действия, заметки и особые дни');
    expect(wrapper.text()).not.toContain('Открыть все итоги');
    expect(wrapper.text()).not.toContain('Открыть все события');
    const recordGroups = wrapper.get('.period-records--featured').findAll('article.period-record-card');
    expect(recordGroups[0].text()).toContain('Итоги месяца');
    expect(recordGroups[1].text()).toContain('События месяца');
    expect(wrapper.text()).toContain('Обзор месяца 4');

    const actions = wrapper.get('details.period-records').get('.period-record-card--disclosure');
    await actions.get('summary').trigger('click');
    expect(actions.findAll('.note-item')).toHaveLength(7);
    expect(actions.text()).toContain('1 из 2');
    await actions.get('[aria-label="Страницы действий месяца"] button:last-child').trigger('click');
    expect(actions.text()).toContain('Действие 8');
    expect(actions.text()).toContain('Действие 9');
  });

  it('does not render an empty actions disclosure for daily records without actions or context', () => {
    const { pinia, store } = createStore();
    store.dailyEntries = [
      {
        ...emptyDailyEntry('2026-07-21'),
        recordedFields: ['sleepMinutes', 'energy'],
        sleepMinutes: 420,
        energy: 3,
      },
    ];

    const wrapper = mount(MonthView, {
      global: { plugins: [pinia], stubs: { EChartPanel: true, RouterLink: routerLinkStub } },
    });

    expect(wrapper.find('details.period-records').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('Показать действия, заметки и особые дни');
  });

  it('shows journal records without pretending that daily analytics exist', () => {
    const { pinia, store } = createStore();
    store.results = [
      {
        id: 1,
        date: '2026-07-21',
        area: 'career',
        title: 'Завершённый итог без дневной записи',
        note: '',
        createdAt: '2026-07-21T12:00:00.000Z',
      },
    ];
    store.lifeEvents = [
      {
        id: 1,
        date: '2026-07-21',
        type: 'event',
        title: 'Важное событие без дневной записи',
        note: '',
        createdAt: '2026-07-21T13:00:00.000Z',
      },
    ];
    const global = { plugins: [pinia], stubs: { EChartPanel: true, RouterLink: routerLinkStub } };
    const week = mount(WeekView, { global });
    const month = mount(MonthView, { global });

    for (const wrapper of [week, month]) {
      expect(wrapper.find('.period-empty-guide').exists()).toBe(false);
      expect(wrapper.get('.period-data-guide').text()).toContain('нет дневных записей');
      expect(wrapper.find('.metrics-grid').exists()).toBe(false);
      expect(wrapper.text()).toContain('Завершённый итог без дневной записи');
      expect(wrapper.text()).toContain('Важное событие без дневной записи');
    }
    expect((week.get('details.week-data-details').element as HTMLDetailsElement).open).toBe(true);
    expect(month.get('.period-records--featured').text()).toContain('Итоги месяца');
    expect(month.find('details.period-records').exists()).toBe(false);
  });

  it('keeps a saved period review visible without daily or journal records', () => {
    const { pinia, store } = createStore();
    store.weeklyReviews = [{ ...emptyWeeklyReview('2026-07-20'), results: ['Неделя не была пустой', '', ''] }];
    store.monthlyReviews = [{ ...emptyMonthlyReview('2026-07-01'), mainPattern: 'Важный вывод месяца' }];
    const global = { plugins: [pinia], stubs: { EChartPanel: true, RouterLink: routerLinkStub } };
    const week = mount(WeekView, { global });
    const month = mount(MonthView, { global });

    for (const wrapper of [week, month]) {
      expect(wrapper.find('.period-empty-guide').exists()).toBe(false);
      expect(wrapper.find('.period-data-guide').exists()).toBe(true);
      expect(wrapper.find('.metrics-grid').exists()).toBe(false);
      expect(wrapper.find('.review-card').exists()).toBe(true);
      expect(wrapper.find('.period-details:not(.review-context-details):not(.month-review-context)').exists()).toBe(false);
    }
    expect((week.get('.review-card input').element as HTMLInputElement).value).toBe('Неделя не была пустой');
    expect((week.get('details.review-context-details').element as HTMLDetailsElement).open).toBe(true);
    expect((month.get('details.month-review-context').element as HTMLDetailsElement).open).toBe(true);
    expect(month.get('details.month-review-context summary').text()).toBe('Разбор месяца');
    expect((month.get('.review-card textarea').element as HTMLTextAreaElement).value).toBe('Важный вывод месяца');
  });

  it('opens the recovered week on its exact dates and keeps all answers editable', () => {
    window.history.replaceState(null, '', '/week?week=2026-07-13#first-use-overview');
    const { pinia, store } = createStore();
    store.weeklyReviews = [
      {
        ...emptyWeeklyReview('2026-07-13'),
        results: ['Закончил черновик'],
        highlights: ['Состоялся важный разговор'],
        stateContext: 'К середине недели было мало сил',
        support: 'Свободный вечер',
        obstacle: 'Недосып',
        nextLever: 'Пока без решения',
      },
    ];
    const wrapper = mount(WeekView, {
      props: { initialWeek: '2026-07-13' },
      global: { plugins: [pinia], stubs: { EChartPanel: true, RouterLink: routerLinkStub } },
    });

    const overview = wrapper.get('#first-use-overview');
    expect(overview.text()).toContain('По вашим воспоминаниям');
    expect(overview.text()).toContain('Закончил черновик');
    expect(overview.text()).toContain('Состоялся важный разговор');
    expect(overview.text()).toContain('К середине недели было мало сил');
    expect(overview.get('a[href="/today"]').text()).toBe('Записать сегодняшний день');
    expect(overview.get('a[href="/today?first-use=edit"]').text()).toBe('Исправить ответы');

    const reviewForm = wrapper.get('#week-review');
    const reviewContext = reviewForm.get('details.review-context-details');
    expect((reviewContext.element as HTMLDetailsElement).open).toBe(true);
    expect(reviewContext.get('summary').text()).toBe('Дела и события');
    expect(reviewForm.findAll('input')).toHaveLength(6);
    expect(reviewForm.text()).toContain('До трёх событий, решений или мыслей');
    expect((reviewForm.findAll('textarea')[0]!.element as HTMLTextAreaElement).value).toBe('К середине недели было мало сил');
  });

  it('shows the real boundary of an incomplete recovered week', () => {
    window.history.replaceState(null, '', '/week?week=2026-07-13#first-use-overview');
    const { pinia, store } = createStore();
    store.settings.firstUse.periodEnd = '2026-07-17';
    store.weeklyReviews = [
      {
        ...emptyWeeklyReview('2026-07-13'),
        coveredThrough: '2026-07-17',
        results: ['Закончил черновик'],
      },
    ];
    const wrapper = mount(WeekView, {
      props: { initialWeek: '2026-07-13' },
      global: { plugins: [pinia], stubs: { EChartPanel: true, RouterLink: routerLinkStub } },
    });

    expect(wrapper.get('#first-use-overview').text()).toContain('Ответы собраны по 17 июля');
    expect(wrapper.get('#first-use-overview').text()).toContain('Остальные дни этой недели не считаются пропущенными');
    expect(wrapper.get('#first-use-overview input[type="date"]').attributes('max')).toBe('2026-07-17');
  });

  it('keeps the current week as default and links to the recovered overview', () => {
    const { pinia, store } = createStore();
    store.weeklyReviews = [{ ...emptyWeeklyReview('2026-07-13'), results: ['Закончил черновик'] }];
    const wrapper = mount(WeekView, {
      global: { plugins: [pinia], stubs: { EChartPanel: true, RouterLink: routerLinkStub } },
    });

    expect(wrapper.get('.period-nav__label').text()).toContain('Текущая неделя');
    expect(wrapper.find('#first-use-overview').exists()).toBe(false);
    expect(wrapper.get('.recovered-week-link').text()).toContain('Ваш первый обзор сохранён');
    expect(wrapper.find('.period-empty-guide').exists()).toBe(true);
  });

  it('keeps the current week as the default after it gets its own data', () => {
    const { pinia, store } = createStore();
    store.weeklyReviews = [{ ...emptyWeeklyReview('2026-07-13'), results: ['Закончил черновик'] }];
    store.dailyEntries = [{ ...emptyDailyEntry('2026-07-21'), importantFact: 'Первая запись текущей недели' }];
    const wrapper = mount(WeekView, {
      global: { plugins: [pinia], stubs: { EChartPanel: true, RouterLink: routerLinkStub } },
    });

    expect(wrapper.get('.period-nav__label').text()).toContain('Текущая неделя');
    expect(wrapper.find('.week-story-list').exists()).toBe(true);
    expect(wrapper.find('.period-empty-guide').exists()).toBe(false);
    expect(wrapper.get('.recovered-week-link').text()).toContain('Ваш первый обзор сохранён');
  });

  it('links the week and month summaries to their review forms', () => {
    vi.setSystemTime(new Date(2026, 7, 30, 12));
    const { pinia, store } = createStore();
    store.dailyEntries = [{ ...emptyDailyEntry('2026-08-30'), importantFact: 'Есть данные для обзора' }];
    const global = { plugins: [pinia], stubs: { EChartPanel: true, RouterLink: routerLinkStub } };
    const week = mount(WeekView, { global });
    const month = mount(MonthView, { global });

    expect(week.get('.review-jump').attributes('href')).toBe('#week-review');
    expect(week.get('#week-review').classes()).toContain('review-card');
    expect(month.get('.review-jump').attributes('href')).toBe('#month-review');
    expect(month.get('#month-review').classes()).toContain('review-card');
  });

  it('keeps current-period reviews optional and out of the way until the end', () => {
    const { pinia, store } = createStore();
    store.dailyEntries = [{ ...emptyDailyEntry('2026-07-21'), importantFact: 'Обычная запись' }];
    const global = { plugins: [pinia], stubs: { EChartPanel: true, RouterLink: routerLinkStub } };
    const week = mount(WeekView, { global });
    const month = mount(MonthView, { global });

    expect(week.get('#week-review').classes()).toContain('period-review-note');
    expect(week.text()).toContain('Обзор необязателен');
    expect(month.get('#month-review').classes()).toContain('period-review-note');
    expect(month.text()).toContain('Обзор необязателен');
    expect(week.find('.review-card').exists()).toBe(false);
    expect(month.find('.review-card').exists()).toBe(false);
  });

  it('does not show empty analytics or review forms as work to complete', () => {
    const { pinia } = createStore();
    const global = { plugins: [pinia], stubs: { EChartPanel: true, RouterLink: routerLinkStub } };
    const week = mount(WeekView, { global });
    const month = mount(MonthView, { global });
    const trends = mount(TrendsView, { global });

    for (const wrapper of [week, month, trends]) {
      expect(wrapper.find('.period-empty-guide').exists()).toBe(true);
      expect(wrapper.find('.metrics-grid').exists()).toBe(false);
      expect(wrapper.find('.dashboard-card').exists()).toBe(false);
    }
    expect(week.find('#week-review').exists()).toBe(false);
    expect(month.find('#month-review').exists()).toBe(false);
    expect(week.find('.review-jump').exists()).toBe(false);
    expect(month.find('.review-jump').exists()).toBe(false);
  });
});
