// @vitest-environment happy-dom

import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import { describe, expect, it, vi } from 'vitest';
import { notifyError, notifySaved, notifyUnknownError } from '@/services/notifications';
import { LocalStorageQuotaError } from '@/services/storageProtection';
import CurrentGoalDialog from '@/features/daily-entry/ui/CurrentGoalDialog.vue';
import { emptyDailyEntry, emptyWeeklyReview } from '@/types';
import { DAILY_ENTRY_SCHEMA_VERSION } from '@/model/dataVersions';
import { addDays, startOfWeek, todayKey } from '@/services/dates';
import TodayView from '@/views/TodayView.vue';
import { createStore, routerLinkStub } from '../helpers/viewScenario';

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

describe('daily entry scenario', () => {
  it.each(['pending', 'conflict', 'error'] as const)('reports only local saving when cloud status is %s', async (status) => {
    const { pinia, store } = createStore();
    store.cloudSyncStatus = status;
    vi.spyOn(store, 'saveEntry').mockResolvedValue(emptyDailyEntry('2026-07-21'));
    const wrapper = mount(TodayView, { global: { plugins: [pinia], stubs: { RouterLink: routerLinkStub } } });
    await wrapper.get('[aria-label="Заметка дня"]').setValue('Только локальный результат');
    await wrapper.get('form').trigger('submit');
    await flushPromises();
    expect(notifySaved).toHaveBeenCalledWith('День сохранён на устройстве');
    expect(store.cloudSyncStatus).toBe(status);
  });

  it('emits a content-free daily event only after the explicit save succeeds', async () => {
    const { pinia, store } = createStore();
    let complete!: () => void;
    vi.spyOn(store, 'saveEntry').mockImplementation(
      (entry) =>
        new Promise((resolve) => {
          complete = () => resolve(entry);
        }),
    );
    const wrapper = mount(TodayView, { global: { plugins: [pinia], stubs: { RouterLink: routerLinkStub } } });
    const card = wrapper.findAll('.form-card').find((item) => item.find('h2').text() === 'Заметка дня')!;
    await card.get('textarea').setValue('PRIVATE DAILY CANARY');
    await flushPromises();
    expect(emittedTelemetry).not.toHaveBeenCalled();
    await wrapper.get('form').trigger('submit');
    expect(emittedTelemetry).not.toHaveBeenCalled();
    complete();
    await flushPromises();
    expect(emittedTelemetry).toHaveBeenCalledWith(
      'daily_entry_saved',
      expect.objectContaining({ save_kind: 'created', entry_count_bucket: '1' }),
    );
    expect(JSON.stringify(emittedTelemetry.mock.calls)).not.toContain('PRIVATE DAILY CANARY');
    wrapper.unmount();
  });
  it('guides the first entry without treating yesterday as a missed day', () => {
    const { pinia } = createStore();
    const wrapper = mount(TodayView, {
      global: { plugins: [pinia], stubs: { RouterLink: routerLinkStub } },
    });

    expect(wrapper.text()).toContain('Отметьте несколько деталей сегодняшнего дня');
    expect(wrapper.text()).toContain('Разделы на главной можно добавить или убрать в настройках');
    expect(wrapper.text()).toContain('Настроить блоки');
    expect(wrapper.text()).toContain('Зачем это заполнять?');
    expect(wrapper.text()).not.toContain('Вчера без записи');
    expect(wrapper.find('.quick-capture').exists()).toBe(false);
    expect(wrapper.text()).toContain('Цель необязательна. Выберите её, если хотите записывать шаги к ней.');
    expect(wrapper.find('.current-goal-summary').exists()).toBe(false);
    expect(wrapper.get('#goal-actions').classes()).toContain('form-card--direction-empty');
    expect(wrapper.get('#goal-actions .context-action').text()).toBe('Выбрать цель');
    expect(wrapper.text()).not.toContain('Конкретное действие');
  });

  it('keeps the daily block settings available after the first entry', () => {
    const { pinia, store } = createStore();
    store.dailyEntries = [emptyDailyEntry('2026-07-20')];
    const wrapper = mount(TodayView, {
      global: { plugins: [pinia], stubs: { RouterLink: routerLinkStub } },
    });

    expect(wrapper.get('.page-heading .daily-layout-settings').attributes('href')).toBe('/settings#daily-blocks');
    expect(wrapper.findAll('.daily-layout-settings')).toHaveLength(1);
    expect(wrapper.text()).toContain('Настроить главную');
    expect(wrapper.text()).not.toContain('С чего начать');
    expect(wrapper.text()).toContain('Состояние и условия');
    expect(wrapper.text()).toContain('Текущая цель');
    expect(wrapper.text()).toContain('Дополнительные разделы');
    expect(wrapper.get('.daily-additional-blocks').attributes('open')).toBeUndefined();
    expect(wrapper.text()).toContain('Заметка дня');
    expect(wrapper.text()).not.toContain('Сон перед этой датой и сколько сил было в этот день.');
  });

  it('shows external analysis after three filled days and persists dismissal', async () => {
    const { pinia, store } = createStore();
    const today = todayKey();
    store.dailyEntries = [-2, -1, 0].map((offset) => ({
      ...emptyDailyEntry(addDays(today, offset)),
      importantFact: `Запись ${offset}`,
    }));
    vi.spyOn(store, 'saveSettings').mockImplementation(async (settings) => {
      store.settings = settings;
    });
    const wrapper = mount(TodayView, {
      global: { plugins: [pinia], stubs: { RouterLink: routerLinkStub } },
    });

    const nudge = wrapper.get('.ai-analysis-nudge');
    const children = Array.from(wrapper.get('.page--today').element.children);
    expect(children.indexOf(nudge.element)).toBeGreaterThan(children.indexOf(wrapper.get('.checkin-grid').element));
    expect(wrapper.find('[aria-label="Пульс недели"]').exists()).toBe(false);
    expect(nudge.text()).toContain('Приложение только соберёт текст и ничего не отправит само');
    expect(nudge.text()).toContain('Подготовить текст');
    expect(nudge.text()).toContain('Открыть выбранный сервис');
    expect(nudge.get('a').attributes('href')).toBe('/week#ai-analysis');

    await nudge.get('.ai-analysis-nudge__dismiss').trigger('click');
    await flushPromises();

    expect(store.settings.aiAnalysisNudgeDismissed).toBe(true);
    expect(wrapper.find('.ai-analysis-nudge').exists()).toBe(false);
    const updatedChildren = Array.from(wrapper.get('.page--today').element.children);
    expect(updatedChildren.indexOf(wrapper.get('[aria-label="Пульс недели"]').element)).toBeLessThan(
      updatedChildren.indexOf(wrapper.get('.checkin-grid').element),
    );
  });

  it('keeps one goal action before optional work context', async () => {
    const { pinia, store } = createStore();
    store.dailyEntries = [{ ...emptyDailyEntry('2026-07-20'), importantFact: 'Обычная запись' }];
    store.settings.activeDailyBlocks = ['career'];
    store.settings.activeLifeAreas = [];
    store.settings.activeFocusTitle = 'Подготовить доклад';
    store.settings.focusOutcomeCriterion = 'Провести репетицию';
    const wrapper = mount(TodayView, {
      global: { plugins: [pinia], stubs: { RouterLink: routerLinkStub } },
    });
    const goalCard = wrapper.get('#goal-actions');
    const workCard = wrapper.get('#career');

    expect(wrapper.html().indexOf('id="goal-actions"')).toBeLessThan(wrapper.html().indexOf('id="career"'));
    expect(goalCard.get('h2').text()).toBe('Шаг по текущей цели');
    expect(wrapper.find('.current-goal-summary').exists()).toBe(false);
    expect(goalCard.classes()).not.toContain('form-card--direction-empty');
    expect(wrapper.text().match(/Подготовить доклад/g)).toHaveLength(1);
    expect(goalCard.get('.goal-context-details').attributes('open')).toBeUndefined();
    expect(workCard.get('h2').text()).toBe('Что было на работе');
    expect(workCard.text()).toContain('Шаги к цели записываются отдельно');
    expect(workCard.find('textarea').exists()).toBe(false);
    expect(wrapper.find('#life-areas').exists()).toBe(false);

    await goalCard
      .findAll('.chip')
      .find((chip) => chip.text().includes('Шаг к цели'))!
      .trigger('click');
    expect(goalCard.find('#goal-action-note').exists()).toBe(true);
  });

  it('offers recovery to an existing user without blocking the daily form', () => {
    const { pinia, store } = createStore();
    store.settings.firstUse = {
      status: 'available',
      weekStart: '',
      periodEnd: '',
      lastStep: 'choice',
      overviewSeen: false,
      updatedAt: '',
    };
    store.dailyEntries = [emptyDailyEntry('2026-07-20')];
    const wrapper = mount(TodayView, {
      global: { plugins: [pinia], stubs: { RouterLink: routerLinkStub } },
    });

    expect(wrapper.text()).toContain('Вспомнить недавнюю неделю?');
    expect(wrapper.text()).toContain('Не сейчас');
    expect(wrapper.find('.checkin-grid').exists()).toBe(true);
  });

  it('shows one optional cue and falls back after first-use is postponed', async () => {
    const { pinia, store } = createStore();
    store.settings.firstUse = {
      status: 'available',
      weekStart: '',
      periodEnd: '',
      lastStep: 'choice',
      overviewSeen: false,
      updatedAt: '',
    };
    store.dailyEntries = [-2, -1, 0].map((offset) => ({
      ...emptyDailyEntry(addDays(todayKey(), offset)),
      importantFact: `Запись ${offset}`,
    }));
    store.weeklyReviews = [{ ...emptyWeeklyReview(startOfWeek(todayKey())), ifThenPlan: 'Если устану, сокращу необязательную задачу' }];
    const wrapper = mount(TodayView, {
      global: { plugins: [pinia], stubs: { RouterLink: routerLinkStub } },
    });

    expect(wrapper.find('.first-use-card--available').exists()).toBe(true);
    expect(wrapper.find('[aria-label="Текущий план недели"]').exists()).toBe(false);
    expect(wrapper.find('.ai-analysis-nudge').exists()).toBe(false);

    await wrapper
      .findAll('.first-use-card__text-button')
      .find((button) => button.text() === 'Не сейчас')!
      .trigger('click');

    expect(wrapper.find('.first-use-card--available').exists()).toBe(false);
    expect(wrapper.get('[aria-label="Текущий план недели"]').text()).toContain('Если устану, сокращу необязательную задачу');
    expect(wrapper.find('.ai-analysis-nudge').exists()).toBe(false);
  });

  it('shows only one current cue and keeps a weekly plan visible without daily tracking', () => {
    const { pinia, store } = createStore();
    store.dailyEntries = [{ ...emptyDailyEntry('2026-07-20'), importantFact: 'Обычная запись' }];
    store.weeklyReviews = [{ ...emptyWeeklyReview('2026-07-20'), ifThenPlan: 'Если застряну, выйду на короткую прогулку' }];
    const wrapper = mount(TodayView, {
      global: { plugins: [pinia], stubs: { RouterLink: routerLinkStub } },
    });

    expect(wrapper.get('[aria-label="Текущий план недели"]').text()).toContain('Если застряну, выйду на короткую прогулку');
    expect(wrapper.find('.today-pulse[aria-label="Пульс недели"]').exists()).toBe(false);
    expect(wrapper.find('.recovery-nudge').exists()).toBe(false);
    const children = Array.from(wrapper.get('.page--today').element.children);
    expect(children.indexOf(wrapper.get('[aria-label="Текущий план недели"]').element)).toBeLessThan(
      children.indexOf(wrapper.get('.checkin-grid').element),
    );
  });

  it('shows the weekly pulse before the form while keeping the note editable', async () => {
    const { pinia, store } = createStore();
    store.settings.aiAnalysisNudgeDismissed = true;
    store.dailyEntries = [{ ...emptyDailyEntry(addDays(todayKey(), -1)), importantFact: 'Вчерашняя запись' }];
    const wrapper = mount(TodayView, { global: { plugins: [pinia], stubs: { RouterLink: routerLinkStub } } });
    const pulse = wrapper.get('[aria-label="Пульс недели"]');
    const children = Array.from(wrapper.get('.page--today').element.children);
    expect(children.indexOf(pulse.element)).toBeLessThan(children.indexOf(wrapper.get('.checkin-grid').element));
    await wrapper.get('[aria-label="Заметка дня"]').setValue('Новый черновик');
    expect(wrapper.get('.checkin-grid').classes()).toContain('checkin-grid--dirty');
    expect(store.dailyEntries).toHaveLength(1);
  });

  it('validates sleep duration and saves the completed day with current criteria', async () => {
    const { pinia, store } = createStore();
    store.settings.activeFocusTitle = 'Главный фокус';
    store.settings.focusOutcomeCriterion = 'Получить проверяемый результат';
    store.settings.focusReviewDate = '2026-08-01';
    store.settings.externalEvidenceCriterion = 'Получен ответ извне';
    store.settings.nutritionGoalCriterion = 'Обычный режим питания';
    store.settings.customActivityOptions = [{ id: 'bachata', label: 'Бачата', icon: '♪', custom: true }];
    const saveEntry = vi.spyOn(store, 'saveEntry').mockImplementation(async (entry) => {
      store.dailyEntries = [entry];
      return entry;
    });
    const wrapper = mount(TodayView, {
      global: { plugins: [pinia], stubs: { RouterLink: routerLinkStub } },
    });

    expect(wrapper.get('[aria-label="Дата записи"]').attributes('max')).toBe('2026-07-21');
    expect(wrapper.text()).toContain('Шаг по текущей цели');
    expect(wrapper.text()).toContain('Физическая активность');
    const directionCard = wrapper.findAll('.form-card').find((card) => card.find('h2').text() === 'Шаг по текущей цели');
    expect(directionCard?.findAll('.chip').map((chip) => chip.text())).not.toContain('Восстановление');
    expect(directionCard?.get('.goal-context-details').attributes('open')).toBeUndefined();
    const movementCard = wrapper.findAll('.form-card').find((card) => card.find('h2').text() === 'Физическая активность');
    expect(movementCard?.findAll('.chip').map((chip) => chip.text())).toEqual([
      '→ Прогулка',
      '△ Тренировка',
      '○ Восстановление',
      '♪ Бачата',
    ]);
    await movementCard!
      .findAll('.chip')
      .find((chip) => chip.text().includes('Бачата'))!
      .trigger('click');
    const lifeAreaCard = wrapper.findAll('.form-card').find((card) => card.find('h2').text() === 'Области жизни');
    expect(lifeAreaCard?.text()).not.toContain('Английский');

    await wrapper.get('#bedtime').setValue('23:40');
    await wrapper.get('#wake-time').setValue('07:30');
    await wrapper.get('#sleep-hours').setValue('9');
    await flushPromises();
    expect(document.body.querySelector('.floating-save-button')?.textContent).toContain('Сохранить день');
    await wrapper.get('form').trigger('submit');

    expect(wrapper.get('[role="alert"]').text()).toBe('Время сна не может быть больше времени в кровати.');
    expect(saveEntry).not.toHaveBeenCalled();

    await wrapper.get('#sleep-hours').setValue('7');
    expect(wrapper.text()).toContain('Как понять, что получилось: Получить проверяемый результат');
    expect(wrapper.text()).toContain('Проверить цель: 1 августа 2026 г.');
    const factCard = wrapper.findAll('.form-card').find((card) => card.find('h2').text() === 'Заметка дня');
    expect(factCard).toBeDefined();
    await factCard!.get('textarea').setValue('Завершил важный разговор');
    await wrapper.get('form').trigger('submit');
    await flushPromises();

    expect(saveEntry).toHaveBeenCalledTimes(1);
    expect(notifySaved).toHaveBeenCalledWith('День сохранён на устройстве');
    expect(saveEntry.mock.calls[0][0]).toMatchObject({
      date: '2026-07-21',
      entrySchemaVersion: DAILY_ENTRY_SCHEMA_VERSION,
      activeDailyBlocksSnapshot: ['sleep', 'context', 'movement', 'nutrition'],
      bedtime: '23:40',
      wakeTime: '07:30',
      sleepMinutes: 420,
      timeInBedMinutes: 470,
      importantFact: 'Завершил важный разговор',
      focusTitle: 'Главный фокус',
      focusOutcomeCriterion: 'Получить проверяемый результат',
      focusReviewDate: '2026-08-01',
      externalEvidenceCriterion: 'Получен ответ извне',
      nutritionCriterion: 'Обычный режим питания',
      activities: ['bachata'],
    });
    expect(document.body.querySelector('.floating-save-button')).toBeNull();
  });

  it('treats a mobile weight with a decimal comma as a saved change', async () => {
    const { pinia, store } = createStore();
    store.dailyEntries = [{ ...emptyDailyEntry('2026-07-21'), weightKg: 88 }];
    const saveEntry = vi.spyOn(store, 'saveEntry').mockImplementation(async (entry) => {
      store.dailyEntries = [entry];
      return entry;
    });
    const wrapper = mount(TodayView, {
      global: { plugins: [pinia], stubs: { RouterLink: routerLinkStub } },
    });

    const weight = wrapper.get('#weight-kg');
    expect(weight.attributes('inputmode')).toBe('decimal');
    await weight.setValue('88,2');
    await flushPromises();

    expect(document.body.querySelector('.floating-save-button')?.textContent).toContain('Сохранить изменения');
    await wrapper.get('form').trigger('submit');
    await flushPromises();

    expect(saveEntry).toHaveBeenCalledTimes(1);
    expect(saveEntry.mock.calls[0][0].weightKg).toBe(88.2);
    expect(wrapper.get('#weight-kg').element).toHaveProperty('value', '88.2');
  });

  it('saves an optional daily experiment note and rejects a bypassed length limit', async () => {
    const { pinia, store } = createStore();
    store.settings.experiment = {
      ...store.settings.experiment,
      id: 'daily-experiment',
      active: true,
      title: 'Не читать новости после 22:00',
      startDate: '2026-07-20',
      endDate: '2026-07-27',
    };
    const saveEntry = vi.spyOn(store, 'saveEntry').mockImplementation(async (entry) => entry);
    const wrapper = mount(TodayView, {
      attachTo: document.body,
      global: { plugins: [pinia], stubs: { RouterLink: routerLinkStub } },
    });
    const experimentCard = wrapper.get('#experiment');
    const note = experimentCard.get('#experiment-note');
    const additionalBlocks = wrapper.get('.daily-additional-blocks');

    expect(experimentCard.text()).toContain('Период: 20 июля — 27 июля 2026 г.');
    expect(additionalBlocks.attributes('open')).toBeUndefined();

    expect(note.attributes('maxlength')).toBe('500');
    await note.setValue('x'.repeat(501));
    await wrapper.get('form').trigger('submit');
    await flushPromises();
    expect(saveEntry).not.toHaveBeenCalled();
    expect(wrapper.get('[role="alert"]').text()).toContain('Заметка к эксперименту длиннее 500 символов');
    expect(additionalBlocks.attributes('open')).toBe('');
    expect(document.activeElement).toBe(note.element);

    await note.setValue('Заранее убрал телефон, но поздний звонок сбил план');
    await experimentCard
      .findAll('button')
      .find((button) => button.text() === 'Нет')!
      .trigger('click');
    await wrapper.get('form').trigger('submit');
    await flushPromises();

    expect(saveEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        experimentId: 'daily-experiment',
        experimentCompleted: false,
        experimentNote: 'Заранее убрал телефон, но поздний звонок сбил план',
      }),
    );
    wrapper.unmount();
  });

  it('opens the native date picker from the full desktop date control', async () => {
    const { pinia } = createStore();
    const wrapper = mount(TodayView, {
      global: { plugins: [pinia], stubs: { RouterLink: routerLinkStub } },
    });
    const input = wrapper.get<HTMLInputElement>('[aria-label="Дата записи"]');
    const showPicker = vi.fn();
    Object.defineProperty(input.element, 'showPicker', { configurable: true, value: showPicker });

    await wrapper.get('[aria-label="Выбрать дату записи"]').trigger('click');

    expect(showPicker).toHaveBeenCalledOnce();
  });

  it('saves explicit empty career and goal answers separately from skipped blocks', async () => {
    const { pinia, store } = createStore();
    store.settings.activeDailyBlocks.push('career');
    store.settings.activeFocusTitle = 'Подготовиться к собеседованию';
    const saveEntry = vi.spyOn(store, 'saveEntry').mockImplementation(async (entry) => entry);
    const wrapper = mount(TodayView, {
      global: { plugins: [pinia], stubs: { RouterLink: routerLinkStub } },
    });

    const workCard = wrapper.get('#career');
    expect(workCard.findAll('.chip').map((chip) => chip.text())).toEqual([
      '▤ Рабочий день',
      '◫ Обучение',
      '◉ Общение по работе',
      '◇ Свой проект',
      '✓ Завершённый результат',
    ]);

    const careerNone = workCard.findAll('button').find((button) => button.text() === 'Ничего из списка');
    const actionNone = wrapper.findAll('button').find((button) => button.text() === 'Шага по цели не было');
    await careerNone!.trigger('click');
    await actionNone!.trigger('click');
    await wrapper.get('form').trigger('submit');
    await flushPromises();

    expect(saveEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        careerStates: [],
        actionDirection: null,
        recordedFields: expect.arrayContaining(['careerStates', 'actionDirection']),
      }),
    );
  });

  it('keeps the original label of a legacy work option without offering unrelated old defaults', () => {
    const { pinia, store } = createStore();
    store.settings.activeDailyBlocks.push('career');
    store.dailyEntries = [
      {
        ...emptyDailyEntry('2026-07-21'),
        careerState: 'external',
        careerStates: ['external'],
        recordedFields: ['careerStates'],
      },
    ];

    const wrapper = mount(TodayView, {
      global: { plugins: [pinia], stubs: { RouterLink: routerLinkStub } },
    });
    const labels = wrapper
      .get('#career')
      .findAll('.chip')
      .map((chip) => chip.text());

    expect(labels).toContain('↗ Отклик/контакт');
    expect(labels).not.toContain('◉ Собеседование');
    expect(labels).toContain('▤ Рабочий день');
  });

  it('keeps archived custom values visible while editing a historical day', () => {
    const { pinia, store } = createStore();
    store.settings.activeDailyBlocks.push('career');
    store.settings.customCareerOptions = [{ id: 'custom:career:archived', label: 'Старый рабочий вариант', archived: true }];
    store.settings.customContextFactorOptions = [{ id: 'custom:context:archived', label: 'Старый фактор', archived: true }];
    store.settings.customLifeAreaOptions = [{ id: 'custom:life:archived', label: 'Старая область', archived: true }];
    store.dailyEntries = [
      {
        ...emptyDailyEntry('2026-07-21'),
        careerStates: ['custom:career:archived'],
        contextFactors: ['custom:context:archived'],
        lifeAreas: ['custom:life:archived'],
        recordedFields: ['careerStates', 'contextFactors', 'lifeAreas'],
        contextFactorsRecorded: true,
        lifeAreasRecorded: true,
      },
    ];

    const wrapper = mount(TodayView, {
      global: { plugins: [pinia], stubs: { RouterLink: routerLinkStub } },
    });

    expect(wrapper.get('#career').text()).toContain('Старый рабочий вариант');
    expect(wrapper.get('#day-conditions').text()).toContain('Старый фактор');
    expect(wrapper.get('#life-areas').text()).toContain('Старая область');
  });

  it('hides inactive blocks while preserving values in an existing entry', async () => {
    const { pinia, store } = createStore();
    store.settings.activeDailyBlocks = [];
    store.settings.activeLifeAreas = [];
    store.dailyEntries = [
      {
        ...emptyDailyEntry('2026-07-21'),
        bedtime: '23:40',
        wakeTime: '07:30',
        sleepMinutes: 600,
        timeInBedMinutes: 470,
        nutritionState: 'supports_goal',
        actionDirection: 'preparation',
        lifeAreas: ['family'],
        lifeAreasRecorded: true,
        recordedFields: ['actionDirection', 'lifeAreas'],
      },
    ];
    const saveEntry = vi.spyOn(store, 'saveEntry').mockImplementation(async (entry) => {
      store.dailyEntries = [entry];
      return entry;
    });
    const wrapper = mount(TodayView, {
      global: { plugins: [pinia], stubs: { RouterLink: routerLinkStub } },
    });

    const headings = wrapper.findAll('.form-card h2').map((heading) => heading.text());
    expect(headings).not.toContain('Сон и состояние');
    expect(headings).not.toContain('Что было на работе');
    expect(headings).not.toContain('Физическая активность');
    expect(headings).not.toContain('Питание');
    expect(headings).toContain('Заметка дня');
    expect(headings).toContain('Области жизни');
    expect(wrapper.text()).toContain('Для этой записи цель не была сохранена.');
    expect(wrapper.findAll('#goal-actions .chip').map((chip) => chip.text())).toContain('◫ Подготовка');

    const factCard = wrapper.findAll('.form-card').find((card) => card.find('h2').text() === 'Заметка дня');
    await factCard!.get('textarea').setValue('Обновил только общий факт');
    await wrapper.get('form').trigger('submit');
    await flushPromises();

    expect(saveEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        bedtime: '23:40',
        sleepMinutes: 600,
        timeInBedMinutes: 470,
        nutritionState: 'supports_goal',
        importantFact: 'Обновил только общий факт',
      }),
    );
  });

  it('does not label an existing historical entry with the current goal or nutrition criterion', async () => {
    const { pinia, store } = createStore();
    store.settings.activeFocusTitle = 'Новая текущая цель';
    store.settings.focusOutcomeCriterion = 'Новый критерий результата';
    store.settings.focusReviewDate = '2026-08-01';
    store.settings.externalEvidenceCriterion = 'Новое внешнее подтверждение';
    store.settings.nutritionGoalCriterion = 'Новый ориентир питания';
    store.dailyEntries = [
      {
        ...emptyDailyEntry('2026-07-20'),
        actionDirection: 'preparation',
        recordedFields: ['actionDirection'],
      },
    ];
    const wrapper = mount(TodayView, {
      global: { plugins: [pinia], stubs: { RouterLink: routerLinkStub } },
    });

    await wrapper.get('[aria-label="Дата записи"]').setValue('2026-07-20');

    const goalCard = wrapper.get('#goal-actions');
    expect(goalCard.classes()).not.toContain('form-card--direction-empty');
    expect(goalCard.text()).toContain('Для этой записи цель не была сохранена.');
    expect(goalCard.text()).not.toContain('Новая текущая цель');
    expect(goalCard.text()).not.toContain('Новый критерий результата');
    expect(goalCard.text()).not.toContain('Новое внешнее подтверждение');
    expect(goalCard.find('.card-settings-link').exists()).toBe(false);
    expect(wrapper.get('#nutrition').text()).not.toContain('Новый ориентир питания');
  });

  it('keeps a historical day without a goal compact and independent from the current goal', async () => {
    const { pinia, store } = createStore();
    store.settings.activeFocusTitle = 'Новая текущая цель';
    store.dailyEntries = [{ ...emptyDailyEntry('2026-07-20'), importantFact: 'Историческая запись' }];
    const wrapper = mount(TodayView, {
      global: { plugins: [pinia], stubs: { RouterLink: routerLinkStub } },
    });

    await wrapper.get('[aria-label="Дата записи"]').setValue('2026-07-20');

    const goalCard = wrapper.get('#goal-actions');
    expect(goalCard.classes()).toContain('form-card--direction-empty');
    expect(goalCard.text()).toContain('Для этой даты цель не была сохранена. Текущие настройки не изменяют историю.');
    expect(goalCard.text()).not.toContain('Новая текущая цель');
    expect(goalCard.find('.context-action').exists()).toBe(false);
  });

  it('shows context independently when the sleep block is hidden', () => {
    const { pinia, store } = createStore();
    store.settings.activeDailyBlocks = ['context'];
    const wrapper = mount(TodayView, {
      global: { plugins: [pinia], stubs: { RouterLink: routerLinkStub } },
    });

    const headings = wrapper.findAll('.form-card h2').map((heading) => heading.text());
    expect(headings).toContain('Что могло повлиять на день');
    expect(headings).not.toContain('Сон и состояние');
    expect(wrapper.text()).toContain('Необычный день');
  });

  it('keeps a dirty entry until the user confirms changing the date', async () => {
    const { pinia, store } = createStore();
    store.dailyEntries = [
      {
        ...emptyDailyEntry('2026-07-20'),
        importantFact: 'Сохранённый факт за вчера',
      },
    ];
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const wrapper = mount(TodayView, {
      global: { plugins: [pinia], stubs: { RouterLink: routerLinkStub } },
    });
    const factCard = wrapper.findAll('.form-card').find((card) => card.find('h2').text() === 'Заметка дня');
    await factCard!.get('textarea').setValue('Несохранённый факт');

    const unloadEvent = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(unloadEvent);
    expect(unloadEvent.defaultPrevented).toBe(true);

    const dateInput = wrapper.get('[aria-label="Дата записи"]');
    await dateInput.setValue('2026-07-20');
    expect(confirm).toHaveBeenCalledOnce();
    expect((dateInput.element as HTMLInputElement).value).toBe('2026-07-21');
    expect(factCard!.get('textarea').element).toHaveProperty('value', 'Несохранённый факт');

    confirm.mockReturnValue(true);
    await dateInput.setValue('2026-07-20');
    expect((dateInput.element as HTMLInputElement).value).toBe('2026-07-20');
    expect(factCard!.get('textarea').element).toHaveProperty('value', 'Сохранённый факт за вчера');
  });

  it('protects a daily draft locally and restores it without creating a completed entry', async () => {
    const { pinia, store } = createStore();
    vi.spyOn(store, 'saveDailyEntryDraft').mockImplementation(async (entry) => {
      const draft = { date: entry.date, entry: structuredClone(entry), updatedAt: '2026-07-21T12:00:00.000Z' };
      store.dailyEntryDrafts = [draft];
      return draft;
    });
    const firstWrapper = mount(TodayView, {
      global: { plugins: [pinia], stubs: { RouterLink: routerLinkStub } },
    });
    const firstFact = firstWrapper.findAll('.form-card').find((card) => card.find('h2').text() === 'Заметка дня');

    await firstFact!.get('textarea').setValue('Черновик важной мысли');
    expect(document.body.querySelector('.floating-save-button')?.textContent).toContain('Сохранить день');
    await vi.advanceTimersByTimeAsync(500);
    await flushPromises();

    expect(store.saveDailyEntryDraft).toHaveBeenCalledWith(expect.objectContaining({ importantFact: 'Черновик важной мысли' }));
    expect(store.dailyEntries).toEqual([]);
    expect(firstWrapper.text()).toContain('Черновик сохранён на этом устройстве');
    firstWrapper.unmount();

    const restoredWrapper = mount(TodayView, {
      global: { plugins: [pinia], stubs: { RouterLink: routerLinkStub } },
    });
    const restoredFact = restoredWrapper.findAll('.form-card').find((card) => card.find('h2').text() === 'Заметка дня');
    expect(restoredFact!.get('textarea').element).toHaveProperty('value', 'Черновик важной мысли');
    expect(restoredWrapper.text()).toContain('Восстановлены несохранённые изменения');
  });

  it('requires an explicit choice when a draft belongs to another saved entry version', async () => {
    const { pinia, store } = createStore();
    store.dailyEntries = [
      {
        ...emptyDailyEntry('2026-07-21'),
        importantFact: 'Более свежая сохранённая запись',
        updatedAt: '2026-07-21T12:00:00.000Z',
      },
    ];
    store.dailyEntryDrafts = [
      {
        date: '2026-07-21',
        entry: {
          ...emptyDailyEntry('2026-07-21'),
          importantFact: 'Локальный черновик',
          updatedAt: '2026-07-21T10:00:00.000Z',
        },
        updatedAt: '2026-07-21T11:00:00.000Z',
      },
    ];
    const saveEntry = vi.spyOn(store, 'saveEntry').mockImplementation(async (entry) => entry);
    const wrapper = mount(TodayView, {
      global: { plugins: [pinia], stubs: { RouterLink: routerLinkStub } },
    });

    expect(wrapper.get('.draft-conflict-notice').text()).toContain('Черновик и сохранённая запись отличаются');
    expect(wrapper.get('.form-card--daily-summary textarea').element).toHaveProperty('value', 'Локальный черновик');
    expect(document.body.querySelector<HTMLButtonElement>('.floating-save-button')?.disabled).toBe(true);

    await wrapper.get('form').trigger('submit');
    expect(saveEntry).not.toHaveBeenCalled();
    expect(notifyError).toHaveBeenCalledWith('Сначала выберите, какую версию записи оставить.');

    const useDraft = wrapper.findAll('.draft-conflict-notice button').find((button) => button.text() === 'Продолжить с черновиком');
    await useDraft!.trigger('click');
    expect(wrapper.find('.draft-conflict-notice').exists()).toBe(false);
    await wrapper.get('form').trigger('submit');
    await flushPromises();
    expect(saveEntry).toHaveBeenCalledWith(expect.objectContaining({ importantFact: 'Локальный черновик' }));
  });

  it('can discard a conflicting draft and keep the saved entry', async () => {
    const { pinia, store } = createStore();
    store.dailyEntries = [
      {
        ...emptyDailyEntry('2026-07-21'),
        importantFact: 'Сохранённая запись',
        updatedAt: '2026-07-21T12:00:00.000Z',
      },
    ];
    store.dailyEntryDrafts = [
      {
        date: '2026-07-21',
        entry: {
          ...emptyDailyEntry('2026-07-21'),
          importantFact: 'Конфликтующий черновик',
          updatedAt: '2026-07-21T10:00:00.000Z',
        },
        updatedAt: '2026-07-21T11:00:00.000Z',
      },
    ];
    const removeDraft = vi.spyOn(store, 'removeDailyEntryDraft').mockImplementation(async (date) => {
      store.dailyEntryDrafts = store.dailyEntryDrafts.filter((draft) => draft.date !== date);
    });
    const wrapper = mount(TodayView, {
      global: { plugins: [pinia], stubs: { RouterLink: routerLinkStub } },
    });

    const keepSaved = wrapper.findAll('.draft-conflict-notice button').find((button) => button.text() === 'Оставить сохранённую');
    await keepSaved!.trigger('click');
    await flushPromises();

    expect(removeDraft).toHaveBeenCalledWith('2026-07-21');
    expect(wrapper.find('.draft-conflict-notice').exists()).toBe(false);
    expect(wrapper.get('.form-card--daily-summary textarea').element).toHaveProperty('value', 'Сохранённая запись');
  });

  it('edits the current goal on Today without leaving or losing a dirty daily form', async () => {
    const { pinia, store } = createStore();
    vi.spyOn(store, 'saveSettings').mockImplementation(async (settings) => {
      store.settings = JSON.parse(JSON.stringify(settings));
    });
    const confirm = vi.spyOn(window, 'confirm');
    const wrapper = mount(TodayView, {
      global: { plugins: [pinia], stubs: { RouterLink: routerLinkStub, Teleport: true } },
    });
    const factCard = wrapper.findAll('.form-card').find((card) => card.find('h2').text() === 'Заметка дня');
    await factCard!.get('textarea').setValue('Не потерять введённый текст');

    await wrapper.get('#goal-actions .context-action').trigger('click');
    const goalDialog = wrapper.getComponent(CurrentGoalDialog);
    expect(goalDialog.props('open')).toBe(true);
    await flushPromises();
    await goalDialog.get('#current-goal-title').setValue('Подготовиться к собеседованию');
    await goalDialog.get('#current-goal-outcome').setValue('Провести пробную встречу');
    await goalDialog.get('#current-goal-review-date').setValue('2026-08-01');
    await goalDialog.get('#current-goal-evidence').setValue('Получить независимую обратную связь');
    await goalDialog.get('form').trigger('submit');
    await flushPromises();

    expect(store.settings.activeFocusTitle).toBe('Подготовиться к собеседованию');
    expect(store.settings.externalEvidenceCriterion).toBe('Получить независимую обратную связь');
    expect(wrapper.get('#goal-actions').text()).toContain('Подготовиться к собеседованию');
    expect(factCard!.get('textarea').element).toHaveProperty('value', 'Не потерять введённый текст');
    expect(confirm).not.toHaveBeenCalled();
    expect(notifySaved).toHaveBeenCalledWith('Текущая цель сохранена');
  });

  it('keeps an edited goal open when a pointer starts inside the dialog and ends on the backdrop', async () => {
    const { pinia } = createStore();
    const wrapper = mount(TodayView, {
      global: { plugins: [pinia], stubs: { RouterLink: routerLinkStub, Teleport: true } },
    });

    await wrapper.get('#goal-actions .context-action').trigger('click');
    const goalDialog = wrapper.getComponent(CurrentGoalDialog);
    const titleInput = goalDialog.get('#current-goal-title');
    await titleInput.setValue('Несохранённое изменение цели');

    await goalDialog.get('.goal-dialog').trigger('pointerdown', { pointerId: 1 });
    await goalDialog.get('.goal-dialog-backdrop').trigger('pointerup', { pointerId: 1 });
    await goalDialog.get('.goal-dialog-backdrop').trigger('click');

    expect(goalDialog.props('open')).toBe(true);
    expect(titleInput.element).toHaveProperty('value', 'Несохранённое изменение цели');

    await goalDialog.get('.goal-dialog-backdrop').trigger('pointerdown', { pointerId: 2 });
    await goalDialog.get('.goal-dialog').trigger('pointerup', { pointerId: 2 });
    await goalDialog.get('.goal-dialog').trigger('pointerdown', { pointerId: 2 });
    await goalDialog.get('.goal-dialog-backdrop').trigger('pointerup', { pointerId: 2 });
    expect(goalDialog.props('open')).toBe(true);

    await goalDialog.get('.goal-dialog-backdrop').trigger('pointerdown', { pointerId: 3 });
    await goalDialog.get('.goal-dialog-backdrop').trigger('pointerup', { pointerId: 3 });
    expect(goalDialog.props('open')).toBe(false);
  });

  it('allows removing the current goal after its settings block was moved to Today', async () => {
    const { pinia, store } = createStore();
    store.settings.activeFocusTitle = 'Старая цель';
    vi.spyOn(store, 'saveSettings').mockImplementation(async (settings) => {
      store.settings = JSON.parse(JSON.stringify(settings));
    });
    const wrapper = mount(TodayView, {
      global: { plugins: [pinia], stubs: { RouterLink: routerLinkStub, Teleport: true } },
    });

    await wrapper.get('#goal-actions .card-settings-link').trigger('click');
    const goalDialog = wrapper.getComponent(CurrentGoalDialog);
    const removeButton = goalDialog.findAll('button').find((button) => button.text() === 'Убрать цель');
    await removeButton!.trigger('click');
    await flushPromises();

    expect(store.settings.activeFocusTitle).toBe('');
    expect(wrapper.get('#goal-actions').text()).toContain('Цель необязательна');
    expect(wrapper.get('#goal-actions').classes()).toContain('form-card--direction-empty');
    expect(notifySaved).toHaveBeenCalledWith('Текущая цель убрана');
  });

  it('reports that a quota write was not saved and allows retrying', async () => {
    const { pinia, store } = createStore();
    const quotaError = new LocalStorageQuotaError();
    const saveEntry = vi.spyOn(store, 'saveEntry').mockRejectedValue(quotaError);
    const wrapper = mount(TodayView, {
      global: { plugins: [pinia], stubs: { RouterLink: routerLinkStub } },
    });
    const factCard = wrapper.findAll('.form-card').find((card) => card.find('h2').text() === 'Заметка дня');
    await factCard!.get('textarea').setValue('Не потерять эту запись');
    expect(document.body.querySelector('.floating-save-button')).not.toBeNull();
    await wrapper.get('form').trigger('submit');
    await flushPromises();

    expect(saveEntry).toHaveBeenCalledOnce();
    expect(emittedTelemetry).not.toHaveBeenCalled();
    expect(notifyUnknownError).toHaveBeenCalledWith(quotaError, 'Не удалось сохранить день');
    expect(quotaError.message).toContain('Ранее сохранённые записи остались');
    expect(quotaError.message).toContain('повторите сохранение');
    expect(notifySaved).not.toHaveBeenCalled();
    expect((document.body.querySelector('.floating-save-button') as HTMLButtonElement).disabled).toBe(false);
    expect(document.body.querySelector('.floating-save-button')).not.toBeNull();
    expect(factCard!.get('textarea').element).toHaveProperty('value', 'Не потерять эту запись');
  });

  it('clears an automatically derived time in bed but preserves a manual duration', async () => {
    const { pinia } = createStore();
    const wrapper = mount(TodayView, {
      global: { plugins: [pinia], stubs: { RouterLink: routerLinkStub } },
    });
    await wrapper.get('#bedtime').setValue('23:40');
    await wrapper.get('#wake-time').setValue('07:30');
    const timeInBedHours = wrapper.get('#time-in-bed-hours');
    expect((timeInBedHours.element as HTMLInputElement).value).toBe('7');

    await wrapper.get('#wake-time').setValue('');
    expect((timeInBedHours.element as HTMLInputElement).value).toBe('');

    await wrapper.get('#wake-time').setValue('07:30');
    await timeInBedHours.setValue('8');
    await wrapper.get('#wake-time').setValue('');
    expect((timeInBedHours.element as HTMLInputElement).value).toBe('8');
  });

  it('blocks route navigation while the daily entry is dirty', async () => {
    const { pinia, store } = createStore();
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/today', component: TodayView },
        { path: '/next', component: { template: '<div>Следующая страница</div>' } },
      ],
    });
    await router.push('/today');
    await router.isReady();
    const wrapper = mount({ template: '<RouterView />' }, { global: { plugins: [pinia, router], stubs: { RouterLink: routerLinkStub } } });
    const factCard = wrapper.findAll('.form-card').find((card) => card.find('h2').text() === 'Заметка дня');
    await factCard!.get('textarea').setValue('Несохранённая запись');
    vi.spyOn(store, 'saveDailyEntryDraft').mockRejectedValue(new Error('IndexedDB unavailable'));
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);

    await router.push('/next');
    expect(router.currentRoute.value.path).toBe('/today');
    expect(confirm).toHaveBeenCalledOnce();

    confirm.mockReturnValue(true);
    await router.push('/next');
    expect(router.currentRoute.value.path).toBe('/next');
    expect(wrapper.text()).toContain('Следующая страница');
  });
});
