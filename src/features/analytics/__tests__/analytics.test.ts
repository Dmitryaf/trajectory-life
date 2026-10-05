import { reactive } from 'vue';
import { describe, expect, it } from 'vitest';
import { buildCoverageSeries, dataCoverageLevel } from '../coverage';
import { buildEventComparison } from '../eventComparison';
import { buildObservations, factorSummaries } from '../observations';
import { entriesForPeriod, entriesForWeek, summarize } from '../periodSummary';
import { buildRangeReviewCues, buildReviewCues } from '../reviewCues';
import { weekSummaryText } from '../presentation';
import {
  AI_PROMPT_CHARACTER_LIMIT,
  buildAiReportCustomRangePayload,
  buildAiReportPayload,
  buildAiReportPrompt,
  buildAiReportRangePayload,
} from '@/features/export/report';
import { addMonths, monthsBetween } from '@/services/dates';
import { AI_REPORT_VERSION } from '@/model/dataVersions';
import {
  defaultSettings,
  emptyDailyEntry,
  experimentAppliesToDate,
  externalCareerIdsForOptions,
  normalizeDailyEntry,
  normalizeLifeEvent,
  normalizeMonthlyReview,
  normalizeSettings,
  normalizeWeeklyReview,
  type DailyEntry,
} from '@/types';

function entry(date: string, patch: Partial<DailyEntry>): DailyEntry {
  const recordedFields = new Set(patch.recordedFields ?? []);
  if (Object.prototype.hasOwnProperty.call(patch, 'activities')) {
    recordedFields.add('activities');
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'contextFactors')) {
    recordedFields.add('contextFactors');
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'lifeAreas')) {
    recordedFields.add('lifeAreas');
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'careerStates') || Object.prototype.hasOwnProperty.call(patch, 'careerState')) {
    recordedFields.add('careerStates');
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'actionDirection')) {
    recordedFields.add('actionDirection');
  }
  return {
    ...emptyDailyEntry(date),
    ...patch,
    recordedFields: Array.from(recordedFields),
    activitiesRecorded: patch.activitiesRecorded ?? Object.prototype.hasOwnProperty.call(patch, 'activities'),
    contextFactorsRecorded: patch.contextFactorsRecorded ?? Object.prototype.hasOwnProperty.call(patch, 'contextFactors'),
    lifeAreasRecorded: patch.lifeAreasRecorded ?? Object.prototype.hasOwnProperty.call(patch, 'lifeAreas'),
  };
}

describe('analytics', () => {
  it('aggregates sleep, career, sport and life areas', () => {
    const summary = summarize([
      entry('2026-07-13', {
        sleepMinutes: 420,
        timeInBedMinutes: 480,
        energy: 3,
        careerState: 'external',
        activities: ['boxing'],
        lifeAreas: ['reading'],
      }),
      entry('2026-07-14', {
        sleepMinutes: 480,
        timeInBedMinutes: 600,
        energy: 5,
        careerState: 'preparation',
        activities: ['bachata'],
        lifeAreas: ['family', 'reading'],
      }),
    ]);

    expect(summary.averageSleep).toBe(450);
    expect(summary.averageTimeInBed).toBe(540);
    expect(summary.averageSleepEfficiency).toBeCloseTo(83.75);
    expect(summary.averageEnergy).toBe(4);
    expect(summary.careerDays).toBe(2);
    expect(summary.externalSteps).toBe(1);
    expect(summary.movementDays).toBe(2);
    expect(summary.nutritionSupportDays).toBe(0);
    expect(summary.nutritionBlockDays).toBe(0);
    expect(summary.externalActionDays).toBe(0);
    expect(summary.preparationDays).toBe(0);
    expect(summary.driftDays).toBe(0);
    expect(summary.specialDays).toBe(0);
    expect(summary.areaCounts.reading).toBe(2);
    expect(summary.areaCounts.family).toBe(1);
  });

  it('tracks nutrition state and weight without scoring the day', () => {
    const summary = summarize([
      entry('2026-07-13', { nutritionState: 'supports_goal', weightKg: 82.4 }),
      entry('2026-07-14', { nutritionState: 'blocks_goal', weightKg: 82.8 }),
      entry('2026-07-15', { nutritionState: 'neutral' }),
    ]);

    expect(summary.nutritionSupportDays).toBe(1);
    expect(summary.nutritionBlockDays).toBe(1);
    expect(summary.averageWeightKg).toBe(82.6);
  });

  it('counts days with external career contact rather than categories', () => {
    const summary = summarize([
      entry('2026-07-13', { careerStates: ['preparation', 'external', 'interview'] }),
      entry('2026-07-14', { careerStates: ['result'] }),
    ]);

    expect(summary.careerDays).toBe(2);
    expect(summary.externalSteps).toBe(2);
  });

  it('uses one external-career rule for built-in, custom and exported summaries', () => {
    const settings = structuredClone(defaultSettings);
    settings.customCareerOptions = [
      { id: 'custom:career:outreach', label: 'Адресный контакт', countsAsExternal: true },
      { id: 'custom:career:planning', label: 'Планирование', countsAsExternal: false },
    ];
    const externalIds = externalCareerIdsForOptions(settings.customCareerOptions);

    expect(externalIds).toEqual(['external', 'interview', 'result', 'work_result', 'custom:career:outreach']);

    const payload = buildAiReportPayload('week', '2026-07-16', {
      entries: [
        entry('2026-07-13', { careerStates: ['work_result'] }),
        entry('2026-07-14', { careerStates: ['custom:career:outreach'] }),
        entry('2026-07-15', { careerStates: ['custom:career:planning'] }),
      ],
      results: [],
      lifeEvents: [],
      reviews: [],
      monthlyReviews: [],
      settings,
    });

    expect(summarize(payload.entries, externalIds).externalSteps).toBe(2);
    expect(payload.summary.externalSteps).toBe(2);
  });

  it('drops unsupported imported enum values', () => {
    const normalized = normalizeDailyEntry({ date: '2026-07-13', nutritionState: 'unknown' as never, actionDirection: 'noise' as never });

    expect(normalized.nutritionState).toBeNull();
    expect(normalized.actionDirection).toBeNull();
  });

  it('tracks action direction without turning it into a score', () => {
    const summary = summarize([
      entry('2026-07-13', { actionDirection: 'external' }),
      entry('2026-07-14', { actionDirection: 'preparation' }),
      entry('2026-07-15', { actionDirection: 'preparation' }),
      entry('2026-07-16', { actionDirection: 'drift' }),
    ]);

    expect(summary.externalActionDays).toBe(1);
    expect(summary.preparationDays).toBe(2);
    expect(summary.driftDays).toBe(1);
    expect(summary.actionDirectionCounts.maintenance).toBe(0);
  });

  it('separates experiment adherence from its outcome', () => {
    const summary = summarize([
      entry('2026-07-13', { experimentCompleted: true, energy: 4 }),
      entry('2026-07-14', { experimentCompleted: false, energy: 2 }),
      entry('2026-07-15', { experimentCompleted: null, energy: 3 }),
    ]);

    expect(summary.experimentMarkedDays).toBe(2);
    expect(summary.experimentCompletedDays).toBe(1);
  });

  it('counts experiment-only and nutrition-note-only entries as days with data', () => {
    const entries = [
      entry('2026-07-13', { experimentCompleted: false }),
      entry('2026-07-14', { experimentNote: 'Поздний звонок помешал выполнить условие' }),
      entry('2026-07-15', { nutritionNote: 'Поздний ужин вне обычного режима' }),
    ];

    expect(entries.map(dataCoverageLevel)).toEqual([1, 1, 1]);
    expect(summarize(entries).coveredEntriesCount).toBe(3);
  });

  it('shows an active experiment only inside its configured dates', () => {
    const experiment = { ...defaultSettings.experiment, active: true, startDate: '2026-07-10', endDate: '2026-07-20' };
    expect(experimentAppliesToDate(experiment, '2026-07-09')).toBe(false);
    expect(experimentAppliesToDate(experiment, '2026-07-10')).toBe(true);
    expect(experimentAppliesToDate(experiment, '2026-07-20')).toBe(true);
    expect(experimentAppliesToDate(experiment, '2026-07-21')).toBe(false);
  });

  it('migrates old settings and event terminology without losing history', () => {
    const settings = normalizeSettings({
      activeLifeAreas: ['family', 'spiritual'],
      customContextFactorOptions: [{ id: 'custom:context:test', label: 'Шум', archived: true }],
    });
    const event = normalizeLifeEvent({ date: '2026-07-10', title: 'Старая веха', type: 'milestone' });
    expect(settings.activeLifeAreas).toEqual(['family']);
    expect(settings.activeDailyBlocks).toEqual(['sleep', 'context', 'career', 'movement', 'nutrition']);
    expect(settings.customContextFactorOptions[0].archived).toBe(true);
    expect(event.type).toBe('change');
  });

  it('uses custom factor labels in summaries', () => {
    const factors = factorSummaries(
      [entry('2026-07-13', { contextFactors: ['custom:context:rain'] })],
      [{ id: 'custom:context:rain', label: 'Шум за окном', icon: '+' }],
    );
    expect(factors[0].label).toBe('Шум за окном');
  });

  it('builds a manual analysis package with labels and experiment context', () => {
    const settings = structuredClone(defaultSettings);
    settings.customContextFactorOptions = [{ id: 'custom:context:rain', label: 'Шум за окном', custom: true }];
    settings.customActivityOptions = [{ id: 'custom:activity:swimming', label: 'Плавание', custom: true }];
    settings.activeFocusTitle = 'Завершить прототип';
    settings.focusOutcomeCriterion = 'Показать работающий сценарий трём людям';
    settings.focusReviewDate = '2026-07-31';
    settings.experiment = {
      ...settings.experiment,
      active: true,
      title: 'Без новостей',
      startDate: '2026-07-13',
      endDate: '2026-07-19',
      conclusion: 'unclear',
    };
    const payload = buildAiReportPayload('week', '2026-07-16', {
      entries: [
        entry('2026-07-13', {
          contextFactors: ['custom:context:rain'],
          experimentCompleted: false,
          experimentNote: 'Поздний звонок помешал выполнить условие',
        }),
      ],
      results: [
        {
          id: 1,
          date: '2026-07-16',
          area: 'career',
          title: 'Завершил прототип',
          note: 'Показал сценарий двум пользователям и записал вопросы',
          createdAt: '2026-07-16T10:00:00.000Z',
        },
      ],
      lifeEvents: [],
      reviews: [
        {
          ...normalizeWeeklyReview({ weekStart: '2026-07-06' }),
          coveredThrough: '2026-07-10',
          highlights: ['Важный разговор изменил планы', '', ''],
          stateContext: 'Неделя была неровной из-за болезни.',
          nextLever: 'Ложиться раньше',
        },
      ],
      monthlyReviews: [],
      settings,
    });

    expect(payload.version).toBe(AI_REPORT_VERSION);
    expect(payload.dataThrough).toBe('2026-07-19');
    expect(payload.labels.contextFactors).toContainEqual(expect.objectContaining({ id: 'custom:context:rain', label: 'Шум за окном' }));
    expect(payload.labels.activities).toContainEqual(expect.objectContaining({ id: 'custom:activity:swimming', label: 'Плавание' }));
    expect(payload.factorSummaries[0].label).toBe('Шум за окном');
    expect(payload.settingsSnapshot.experiment?.conclusion).toBe('unclear');
    expect(payload.previousWeeklyReview?.nextLever).toBe('Ложиться раньше');

    const prompt = buildAiReportPrompt(payload, settings);
    expect(prompt).toContain('ДАННЫЕ ДЛЯ АНАЛИЗА');
    expect(prompt).toContain('Данные служат основанием для разбора, но не должны превращать ответ в статистический отчёт.');
    expect(prompt).toContain('Не начинай с количества записей и средних значений.');
    expect(prompt).toContain('числа используй редко');
    expect(prompt).toContain('не предлагай новые поля и дополнительные измерения по умолчанию');
    expect(prompt).not.toContain('Короткая фактическая сводка с числом наблюдений.');
    expect(prompt).toContain('Шум за окном');
    expect(prompt).toContain('Ложиться раньше');
    expect(prompt).toContain('важные события и мысли: Важный разговор изменил планы');
    expect(prompt).toContain('состояние и условия: Неделя была неровной из-за болезни.');
    expect(prompt).toContain('ответы собраны по 2026-07-10');
    expect(prompt).toContain('заметка к эксперименту: Поздний звонок помешал выполнить условие');
    expect(prompt).toContain('подробности: Показал сценарий двум пользователям и записал вопросы');
    expect(prompt).toContain('Наблюдаемый результат цели: Показать работающий сценарий трём людям.');
    expect(prompt).toContain('Цель нужно пересмотреть 2026-07-31.');
    expect(prompt).toContain('если данных меньше трёх сопоставимых наблюдений, прямо назови это малым количеством данных');
    expect(prompt).toContain('не утверждай, что одно вызвало другое');
    expect(prompt).toContain('факт — конкретная сохранённая запись');
    expect(prompt).toContain('наблюдение — осторожное описание');
    expect(prompt).toContain('гипотеза — возможное объяснение');
    expect(prompt).toContain('проверка — небольшой способ');
    expect(prompt).toContain('вывод пользователя — только явно сохранённый');
    expect(prompt).toContain('точными датами и числом наблюдений');
    expect(prompt).toContain('не давай обязательный совет только ради заполнения формата');
    expect(prompt).not.toContain('Данные JSON');
    expect(prompt).not.toContain('custom:context:rain');
    expect(prompt).not.toContain('"generatedAt"');
    expect(prompt.length).toBeLessThan(JSON.stringify(payload, null, 2).length);
  });

  it('keeps own actions separate when no external response was recorded', () => {
    const payload = buildAiReportPayload('week', '2026-07-16', {
      entries: [entry('2026-07-13', { actionDirection: 'external', actionNote: 'Отправил предложение' })],
      results: [],
      lifeEvents: [],
      reviews: [],
      monthlyReviews: [],
      settings: defaultSettings,
    });

    const prompt = buildAiReportPrompt(payload, defaultSettings);
    expect(prompt).toContain('по цели: Шаг к цели (Отправил предложение)');
    expect(prompt).toContain('если внешнего ответа или результата нет в записях, так и скажи');
    expect(prompt).toContain('Не называй действие результатом, если ответ извне не записан.');
  });

  it('names a sample below three observations as insufficient for a conclusion', () => {
    const payload = buildAiReportPayload('week', '2026-07-16', {
      entries: [entry('2026-07-13', { energy: 2 }), entry('2026-07-14', { energy: 4 })],
      results: [],
      lifeEvents: [],
      reviews: [],
      monthlyReviews: [],
      settings: defaultSettings,
    });

    const prompt = buildAiReportPrompt(payload, defaultSettings);
    expect(prompt).toContain('Энергия: 3 / 5 (2 измерения).');
    expect(prompt).toContain('если данных меньше трёх сопоставимых наблюдений, прямо назови это малым количеством данных');
    expect(prompt).toContain('пропуск не считай нулём');
  });

  it('keeps a temporal coincidence as chronology rather than a causal claim', () => {
    const payload = buildAiReportPayload('week', '2026-07-16', {
      entries: [entry('2026-07-13', { importantFact: 'Изменил распорядок дня' })],
      results: [],
      lifeEvents: [
        {
          id: 1,
          date: '2026-07-14',
          type: 'insight',
          title: 'На следующий день стало легче сосредоточиться',
          note: '',
          createdAt: '2026-07-14T18:00:00.000Z',
        },
      ],
      reviews: [],
      monthlyReviews: [],
      settings: defaultSettings,
    });

    const prompt = buildAiReportPrompt(payload, defaultSettings);
    expect(prompt).toContain('Изменил распорядок дня');
    expect(prompt).toContain('На следующий день стало легче сосредоточиться');
    expect(prompt).toContain('совместное появление фактов и порядок событий не доказывают причину');
    expect(prompt).toContain('причинную формулировку заменяй описанием временной связи');
  });

  it('labels an active experiment as a user hypothesis that is still being tested', () => {
    const settings = structuredClone(defaultSettings);
    settings.experiment = {
      ...settings.experiment,
      active: true,
      title: 'Тихое начало дня',
      hypothesis: 'Если начать без новостей, будет легче сосредоточиться',
      startDate: '2026-07-13',
      endDate: '2026-07-19',
      conclusion: '',
    };
    const payload = buildAiReportPayload('week', '2026-07-16', {
      entries: [entry('2026-07-13', { experimentCompleted: true })],
      results: [],
      lifeEvents: [],
      reviews: [],
      monthlyReviews: [],
      settings,
    });

    const prompt = buildAiReportPrompt(payload, settings);
    expect(prompt).toContain('что пользователь хочет проверить: Если начать без новостей, будет легче сосредоточиться');
    expect(prompt).toContain('гипотеза — возможное объяснение наблюдения, которое ещё не подтверждено');
    expect(prompt).not.toContain('вывод пользователя: Если начать без новостей');
  });

  it('builds an analysis package from reactive application settings', () => {
    const settings = reactive(structuredClone(defaultSettings));
    settings.experiment = {
      ...settings.experiment,
      active: true,
      title: 'Спокойный вечер',
      startDate: '2026-07-13',
      endDate: '2026-07-19',
    };

    const payload = buildAiReportPayload('week', '2026-07-16', {
      entries: [],
      results: [],
      lifeEvents: [],
      reviews: [],
      monthlyReviews: [],
      settings,
    });

    expect(payload.settingsSnapshot.experiment?.title).toBe('Спокойный вечер');
    expect(() => JSON.stringify(payload)).not.toThrow();
  });

  it('limits a long-range analysis package to its selected data boundary', () => {
    const payload = buildAiReportRangePayload(3, '2026-07-16', {
      entries: [entry('2026-05-01', { energy: 3 }), entry('2026-07-17', { energy: 5 })],
      results: [],
      lifeEvents: [],
      reviews: [],
      monthlyReviews: [],
      settings: defaultSettings,
    });
    expect(payload.start).toBe('2026-05-01');
    expect(payload.dataThrough).toBe('2026-07-16');
    expect(payload.entries.map((item) => item.date)).toEqual(['2026-05-01']);
  });

  it('keeps every daily reflection inside an exact custom analysis period', () => {
    const payload = buildAiReportCustomRangePayload('2026-06-15', '2026-07-02', {
      entries: [
        entry('2026-06-14', { importantFact: 'За пределами периода' }),
        entry('2026-06-16', {
          contextNote: 'Поймал себя на том, что откладываю отдых, даже когда устал.',
          importantFact: 'Обычный разговор помог сформулировать важную мысль.',
        }),
        entry('2026-07-02', { importantFact: 'Второй день нового месяца тоже должен попасть в анализ.' }),
        entry('2026-07-03', { importantFact: 'Тоже за пределами периода' }),
      ],
      results: [],
      lifeEvents: [],
      reviews: [{ ...normalizeWeeklyReview({ weekStart: '2026-06-15' }), nextLever: 'Оставлять время на отдых' }],
      monthlyReviews: [{ ...normalizeMonthlyReview({ monthStart: '2026-06-01' }), mainPattern: 'Часто откладывал отдых' }],
      settings: defaultSettings,
    });

    expect(payload.start).toBe('2026-06-15');
    expect(payload.end).toBe('2026-07-02');
    expect(payload.entries.map((item) => item.date)).toEqual(['2026-06-16', '2026-07-02']);
    expect(payload.weeklyReviews).toHaveLength(1);
    expect(payload.monthlyReviews).toHaveLength(1);

    const prompt = buildAiReportPrompt(payload, defaultSettings);
    expect(prompt).toContain('Записи по дням');
    expect(prompt).not.toContain('Покрытие по месяцам');
    expect(prompt).toContain('Поймал себя на том, что откладываю отдых');
    expect(prompt).toContain('Обычный разговор помог сформулировать важную мысль');
    expect(prompt).toContain('Второй день нового месяца тоже должен попасть в анализ');
    expect(prompt).not.toContain('За пределами периода');
  });

  it('summarizes long ranges by month and bounds verbose records', () => {
    const longNote = 'Подробное наблюдение '.repeat(400);
    const payload = buildAiReportRangePayload(12, '2026-07-16', {
      entries: Array.from({ length: 180 }, (_, index) =>
        entry(`2026-${String(2 + Math.floor(index / 28)).padStart(2, '0')}-${String(1 + (index % 28)).padStart(2, '0')}`, { energy: 3 }),
      ),
      results: [],
      lifeEvents: Array.from({ length: 140 }, (_, index) => ({
        id: index + 1,
        date: '2026-07-01',
        title: `Наблюдение ${index}`,
        note: longNote,
        type: 'insight' as const,
        createdAt: '2026-07-01T10:00:00.000Z',
      })),
      reviews: [],
      monthlyReviews: [],
      settings: defaultSettings,
    });

    const prompt = buildAiReportPrompt(payload, defaultSettings);
    expect(prompt).toContain('Покрытие по месяцам');
    expect(prompt).not.toContain('Записи по дням');
    expect(prompt).toContain('Не включено подробностей: 80');
    expect(prompt.length).toBeLessThanOrEqual(AI_PROMPT_CHARACTER_LIMIT);
  });

  it('selects entries only from the requested Monday-Sunday week', () => {
    const entries = [entry('2026-07-12', {}), entry('2026-07-13', {}), entry('2026-07-19', {}), entry('2026-07-20', {})];
    expect(entriesForWeek(entries, '2026-07-16').map(({ date }) => date)).toEqual(['2026-07-13', '2026-07-19']);
  });

  it('selects entries from an arbitrary calendar period', () => {
    const entries = [entry('2026-04-30', {}), entry('2026-05-01', {}), entry('2026-07-31', {}), entry('2026-08-01', {})];

    expect(entriesForPeriod(entries, '2026-05-01', '2026-07-31').map(({ date }) => date)).toEqual(['2026-05-01', '2026-07-31']);
  });

  it('builds calendar month ranges for long trends', () => {
    expect(addMonths('2026-07-16', -2)).toBe('2026-05-01');
    expect(monthsBetween('2026-05-15', '2026-07-31')).toEqual(['2026-05-01', '2026-06-01', '2026-07-01']);
  });

  it('creates a factual summary without a score', () => {
    const summary = summarize([entry('2026-07-13', { careerState: 'external', activities: ['boxing'], lifeAreas: ['family'] })]);
    const text = weekSummaryText(summary, ['family', 'reading']);
    expect(text).toContain('работа отмечена в 1 из 1 заполненных дней этого блока');
    expect(text).toContain('Вы отмечали: семья');
    expect(text).toContain('Не отмечались: чтение');
    expect(text).not.toContain('%');
  });

  it('counts special days separately from activity', () => {
    const summary = summarize([
      entry('2026-07-13', { specialDay: 'sick', specialDayNote: 'простуда' }),
      entry('2026-07-14', { activities: ['walk'] }),
    ]);

    expect(summary.specialDays).toBe(1);
    expect(summary.movementDays).toBe(1);
  });

  it('builds cautious observations from repeated patterns', () => {
    const observations = buildObservations([
      entry('2026-07-13', { sleepMinutes: 480, energy: 5, activities: ['walk'] }),
      entry('2026-07-14', { sleepMinutes: 450, energy: 4, activities: ['boxing'] }),
      entry('2026-07-15', { sleepMinutes: 470, energy: 5, activities: ['walk'] }),
      entry('2026-07-16', { sleepMinutes: 440, energy: 4, activities: ['bachata'] }),
      entry('2026-07-17', { sleepMinutes: 360, energy: 2, activities: [] }),
      entry('2026-07-18', { sleepMinutes: 390, energy: 3, activities: [] }),
      entry('2026-07-19', { sleepMinutes: 350, energy: 2, activities: [] }),
      entry('2026-07-20', { sleepMinutes: 380, energy: 2, activities: [] }),
      entry('2026-07-21', { specialDay: 'travel' }),
      entry('2026-07-22', { contextFactors: ['news'] }),
      entry('2026-07-23', { contextFactors: ['news'] }),
    ]);

    expect(observations.map((item) => item.id)).toContain('movement-energy');
    expect(observations.map((item) => item.id)).toContain('sleep-energy');
    expect(observations.map((item) => item.id)).toContain('special-days');
    expect(observations.map((item) => item.id)).toContain('context-factor');
  });

  it('summarizes context factors without scoring them', () => {
    const factors = factorSummaries([
      entry('2026-07-13', { sleepMinutes: 360, energy: 2, contextFactors: ['news', 'screen'] }),
      entry('2026-07-14', { sleepMinutes: 420, energy: 3, contextFactors: ['news'] }),
    ]);

    expect(factors[0].id).toBe('news');
    expect(factors[0].count).toBe(2);
    expect(factors[0].averageSleep).toBe(390);
    expect(factors[0].averageEnergy).toBe(2.5);
  });

  it('builds local review cues from factual period data', () => {
    const cues = buildReviewCues(
      'week',
      [
        entry('2026-07-13', { sleepMinutes: 360, contextFactors: ['news'], careerState: 'external' }),
        entry('2026-07-14', { sleepMinutes: 390, contextFactors: ['news'], actionDirection: 'preparation' }),
        entry('2026-07-15', { sleepMinutes: 480 }),
        entry('2026-07-16', { sleepMinutes: 450 }),
      ],
      [{ id: 1, date: '2026-07-16', area: 'career', title: 'Отправил отклики', note: '', createdAt: '2026-07-16T10:00:00.000Z' }],
      [{ id: 1, date: '2026-07-15', type: 'decision', title: 'Сменил фокус', note: '', createdAt: '2026-07-15T10:00:00.000Z' }],
    );

    expect(cues.map((cue) => cue.id)).toEqual(
      expect.arrayContaining(['coverage', 'short-sleep', 'factor', 'career', 'context', 'results']),
    );
    expect(cues.find((cue) => cue.id === 'coverage')?.tone).toBe('good');
    expect(cues.find((cue) => cue.id === 'factor')?.text).toContain('Новости');
  });

  it('flags preparation when it does not turn into external contact', () => {
    const cues = buildReviewCues(
      'week',
      [
        entry('2026-07-13', { actionDirection: 'preparation' }),
        entry('2026-07-14', { actionDirection: 'preparation' }),
        entry('2026-07-15', { actionDirection: 'preparation' }),
        entry('2026-07-16', { actionDirection: 'maintenance' }),
      ],
      [],
      [],
    );

    expect(cues.map((cue) => cue.id)).toContain('direction-preparation');
    expect(cues.find((cue) => cue.id === 'direction-preparation')?.tone).toBe('warning');
  });

  it('keeps completed results visible when review cues are crowded', () => {
    const cues = buildReviewCues(
      'week',
      [
        entry('2026-07-13', {
          sleepMinutes: 360,
          contextFactors: ['news'],
          careerState: 'external',
          nutritionState: 'blocks_goal',
          specialDay: 'overload',
        }),
        entry('2026-07-14', { sleepMinutes: 390, contextFactors: ['news'], nutritionState: 'blocks_goal' }),
        entry('2026-07-15', { sleepMinutes: 480 }),
        entry('2026-07-16', { sleepMinutes: 450 }),
      ],
      [
        {
          id: 1,
          date: '2026-07-16',
          area: 'career',
          title: 'Закончил отклики недели',
          note: '',
          createdAt: '2026-07-16T10:00:00.000Z',
        },
      ],
      [{ id: 1, date: '2026-07-15', type: 'event', title: 'Сложный внешний день', note: '', createdAt: '2026-07-15T10:00:00.000Z' }],
    );

    expect(cues).toHaveLength(6);
    expect(cues.map((cue) => cue.id)).toContain('results');
  });

  it('normalizes weekly review if-then plans for older backups', () => {
    const review = normalizeWeeklyReview({
      weekStart: '2026-07-13',
      results: ['результат'],
      support: 'режим',
      obstacle: 'новости',
      nextLever: 'закрывать новости',
    });

    expect(review.ifThenPlan).toBe('');
    expect(review.previousPlanOutcome).toBe('');
    expect(review.highlights).toEqual(['', '', '']);
    expect(review.stateContext).toBe('');
    expect(review.updatedAt).toBe('');
  });

  it('keeps special days out of baseline state averages', () => {
    const summary = summarize([
      entry('2026-07-13', { sleepMinutes: 480, energy: 4 }),
      entry('2026-07-14', { sleepMinutes: 180, energy: 1, specialDay: 'travel' }),
    ]);

    expect(summary.entriesCount).toBe(2);
    expect(summary.ordinaryEntriesCount).toBe(1);
    expect(summary.averageSleep).toBe(480);
    expect(summary.averageEnergy).toBe(4);
    expect(summary.sleepSamples).toBe(1);
  });

  it('measures sleep timing variation across midnight without a false jump', () => {
    const summary = summarize([
      entry('2026-07-13', { bedtime: '23:30', wakeTime: '07:30' }),
      entry('2026-07-14', { bedtime: '00:30', wakeTime: '08:30' }),
    ]);

    expect(summary.sleepTimingSamples).toBe(2);
    expect(summary.bedtimeVariationMinutes).toBe(30);
    expect(summary.wakeTimeVariationMinutes).toBe(30);
  });

  it('compares repeated factors with ordinary days without the factor', () => {
    const factors = factorSummaries([
      entry('2026-07-13', { sleepMinutes: 360, energy: 2, contextFactors: ['news'] }),
      entry('2026-07-14', { sleepMinutes: 420, energy: 3, contextFactors: ['news'] }),
      entry('2026-07-15', { sleepMinutes: 480, energy: 4, contextFactors: [] }),
      entry('2026-07-16', { sleepMinutes: 540, energy: 5, contextFactors: [] }),
      entry('2026-07-17', { sleepMinutes: 120, energy: 1, contextFactors: ['news'], specialDay: 'sick' }),
    ]);

    expect(factors[0].count).toBe(2);
    expect(factors[0].averageSleep).toBe(390);
    expect(factors[0].averageSleepWithout).toBe(510);
    expect(factors[0].energySamplesWithout).toBe(2);
  });

  it('uses proportional rules for long-period review cues', () => {
    const entries = Array.from({ length: 12 }, (_, index) =>
      entry(`2026-${String(5 + Math.floor(index / 4)).padStart(2, '0')}-${String((index % 4) + 1).padStart(2, '0')}`, {
        actionDirection: index < 10 ? 'preparation' : 'external',
      }),
    );
    const cues = buildRangeReviewCues(3, entries, [], []);

    expect(cues.map((cue) => cue.id)).toContain('direction-preparation');
  });

  it('normalizes monthly reviews for older backups', () => {
    const review = normalizeMonthlyReview({ monthStart: '2026-07-01', mainPattern: 'Сон менялся' });

    expect(review.mainPattern).toBe('Сон менялся');
    expect(review.ifThenPlan).toBe('');
    expect(review.nextFocus).toBe('');
    expect(review.updatedAt).toBe('');
  });

  it('separates missing, partial and core daily data without a score', () => {
    const partial = entry('2026-07-13', { energy: 3 });
    const core = entry('2026-07-14', { energy: 4, actionDirection: 'external' });

    expect(dataCoverageLevel(partial)).toBe(1);
    expect(dataCoverageLevel(core)).toBe(2);
    expect(buildCoverageSeries([partial, core], '2026-07-13', '2026-07-15')).toEqual([
      ['2026-07-13', 1],
      ['2026-07-14', 2],
      ['2026-07-15', 0],
    ]);
  });

  it('does not treat skipped multi-select blocks as explicit zeroes', () => {
    const skipped = entry('2026-07-13', {});
    const explicitNone = entry('2026-07-14', { activities: [], contextFactors: [], lifeAreas: [] });
    const summary = summarize([skipped, explicitNone]);

    expect(summary.movementSamples).toBe(1);
    expect(summary.lifeAreaSamples).toBe(1);
    expect(factorSummaries([skipped, explicitNone])).toEqual([]);
  });

  it('uses explicit empty career and goal answers in denominators without inventing actions', () => {
    const skipped = entry('2026-07-13', {});
    const explicitNone = entry('2026-07-14', { careerStates: [], actionDirection: null });
    const action = entry('2026-07-15', { careerStates: ['external'], actionDirection: 'external' });
    const summary = summarize([skipped, explicitNone, action]);

    expect(summary.careerDays).toBe(1);
    expect(summary.careerSamples).toBe(2);
    expect(summary.externalActionDays).toBe(1);
    expect(summary.actionDirectionSamples).toBe(2);
    expect(dataCoverageLevel(explicitNone)).toBe(1);
  });

  it('does not call empty saved shells sufficient review data', () => {
    const cues = buildReviewCues(
      'week',
      Array.from({ length: 7 }, (_, index) => entry(`2026-07-${String(13 + index).padStart(2, '0')}`, {})),
      [],
      [],
    );

    expect(cues.find((cue) => cue.id === 'coverage')?.tone).toBe('warning');
  });

  it('compares equal windows around an event and excludes special days from state averages', () => {
    const comparison = buildEventComparison(
      '2026-07-15',
      [
        entry('2026-07-10', { sleepMinutes: 480, energy: 4, actionDirection: 'preparation' }),
        entry('2026-07-11', { sleepMinutes: 120, energy: 1, specialDay: 'travel' }),
        entry('2026-07-16', { sleepMinutes: 420, energy: 3, actionDirection: 'external' }),
        entry('2026-07-17', { sleepMinutes: 360, energy: 2, actionDirection: 'external' }),
      ],
      [{ id: 1, date: '2026-07-17', area: 'career', title: 'Получил ответ', note: '', createdAt: '2026-07-17T10:00:00.000Z' }],
      undefined,
      14,
      '2026-07-20',
    );

    expect(comparison?.windowDays).toBe(5);
    expect(comparison?.beforeStart).toBe('2026-07-10');
    expect(comparison?.afterEnd).toBe('2026-07-20');
    expect(comparison?.metrics.find((metric) => metric.id === 'sleep')).toMatchObject({
      before: 480,
      after: 390,
      beforeSamples: 1,
      afterSamples: 2,
    });
    expect(comparison?.metrics.find((metric) => metric.id === 'external')).toMatchObject({ before: 0, after: 100 });
    expect(comparison?.metrics.find((metric) => metric.id === 'results')).toMatchObject({ before: 0, after: 1 });
  });
});
