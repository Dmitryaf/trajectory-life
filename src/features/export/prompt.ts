import { formatDate, formatMinutes } from '@/services/dates';
import { summarize } from '@/features/analytics/periodSummary';
import { weekSummaryText } from '@/features/analytics/presentation';
import { experimentDecisionLabel } from '../experiments/model';
import type { ExperimentSummary } from '../analytics/experimentComparison';
import {
  dailyBlockOptions,
  dailyFieldWasRecorded,
  lifeAreaOptions,
  type AppSettings,
  type DailyEntry,
  type ExperimentMetricId,
  type ExperimentRecord,
  type MonthlyReview,
  type WeeklyReview,
} from '@/types';
import { AI_PROMPT_CHARACTER_LIMIT, type AiReportPayload } from './payload';

export function buildAiReportPrompt(payload: AiReportPayload, settings: AppSettings): string {
  const areaOptions = [...lifeAreaOptions, ...settings.customLifeAreaOptions];
  const summaryText = payload.period === 'week' ? weekSummaryText(payload.summary, settings.activeLifeAreas, areaOptions) : '';
  let periodTitle = `период ${formatDate(payload.start, { day: 'numeric', month: 'long', year: 'numeric' })} — ${formatDate(payload.end, { day: 'numeric', month: 'long', year: 'numeric' })}`;
  if (payload.period === 'week') {
    periodTitle = `неделю ${formatDate(payload.start, { day: 'numeric', month: 'short' })} — ${formatDate(payload.end, { day: 'numeric', month: 'short' })}`;
  } else if (payload.period === 'month') {
    periodTitle = `месяц ${formatDate(payload.start, { month: 'long', year: 'numeric' })}`;
  } else if (payload.rangeMonths) {
    periodTitle = `${payload.rangeMonths} месяцев: ${formatDate(payload.start, { month: 'short', year: 'numeric' })} — ${formatDate(payload.end, { month: 'short', year: 'numeric' })}`;
  }

  const sections = buildReadableSections(payload);

  const prompt = [
    `Проанализируй данные личного трекера «Траектория» за ${periodTitle}. Фактические данные доступны по ${formatDate(payload.dataThrough, { day: 'numeric', month: 'long', year: 'numeric' })}.`,
    '',
    'Роль: спокойный и внимательный собеседник, который помогает человеку осмыслить прожитый период по его записям. Не морализируй, не ставь диагнозы, не оценивай личность и не считай общий балл.',
    'Цель: помочь понять, что было главным, что изменилось, что могло поддерживать или мешать и на чём разумно сосредоточиться дальше. Данные служат основанием для разбора, но не должны превращать ответ в статистический отчёт.',
    '',
    'Формат ответа:',
    '1. «Главное за период» — начни с 2–4 предложений о самых значимых изменениях, событиях или повторяющейся картине. Не начинай с количества записей и средних значений.',
    '2. «Что изменилось» — опиши последовательность собственных действий пользователя, внешних ответов или результатов, важных событий и его наблюдений. Не называй действие результатом, если ответ извне не записан.',
    '3. «Что поддерживало и что мешало» — выбери не больше трёх действительно заметных связей. Если картина противоречивая, скажи об этом простыми словами.',
    '4. «Что показало прошлое решение» — добавь только при наличии прошлого обзора или эксперимента. Отдели выполнимость решения от его возможного влияния на состояние.',
    '5. «Вопросы для исследования» — предложи не больше трёх кандидатов, которые пользователь может выбрать для продолжения разговора. Для каждого укажи основание с точными датами и числом наблюдений, альтернативное объяснение или пробел данных и один открытый вопрос пользователю. Не добавляй кандидатов без достаточного основания.',
    '6. «На чём сосредоточиться дальше» — предложи один фокус или небольшую проверку только после открытого вопроса и не требуй усложнять ежедневное ведение.',
    'Не создавай раздел ради формата, если для него нет содержательного материала.',
    '',
    'Уровни доказательности:',
    '- факт — конкретная сохранённая запись: действие пользователя, внешний ответ, полученный результат или событие; не смешивай эти виды фактов;',
    '- наблюдение — осторожное описание того, что повторялось, различалось или следовало одно за другим в доступных записях;',
    '- гипотеза — возможное объяснение наблюдения, которое ещё не подтверждено;',
    '- проверка — небольшой способ отличить гипотезу от альтернативного объяснения в следующих записях;',
    '- вывод пользователя — только явно сохранённый самим пользователем итог обзора или эксперимента; не создавай его от своего имени;',
    '- маркируй гипотезу и проверку прямо, а факт, наблюдение и вывод пользователя формулируй так, чтобы их нельзя было спутать.',
    '',
    'Язык и подача:',
    '- пиши естественно, короткими абзацами и словами обычного человека; обращайся на «ты»;',
    '- числа используй редко — только когда они заметно меняют смысл вывода или помогают сравнить два решения;',
    '- не перечисляй подряд средние значения, доли и число наблюдений; не используй таблицы;',
    '- избегай слов «выборка», «корреляция», «классификация», «знаменатель» и других исследовательских терминов, если без них можно передать тот же смысл;',
    '- не повторяй одну и ту же оговорку после каждого вывода. Если ограничения важны, собери их в одну короткую фразу в конце;',
    '- не предлагай новые поля и дополнительные измерения по умолчанию. Сначала используй уже существующие записи и свободную заметку.',
    '',
    'Границы выводов:',
    '- пропуск не считай нулём или ответом «нет»;',
    '- особые дни не используй как обычную базу сравнения;',
    '- условия дня сравнивай с отмеченными днями без них и упоминай только заметные и достаточно подтверждённые различия;',
    '- совместное появление фактов и порядок событий не доказывают причину: не утверждай, что одно вызвало другое;',
    '- причинную формулировку заменяй описанием временной связи или последующего записанного результата;',
    '- если данных меньше трёх сопоставимых наблюдений, прямо назови это малым количеством данных и не придумывай совет;',
    '- если внешнего ответа или результата нет в записях, так и скажи: собственное действие пользователя не подтверждает внешний эффект;',
    '- не давай обязательный совет только ради заполнения формата;',
    '- не обсуждай работу, вес или эксперимент, если соответствующих данных нет;',
    '- не продолжай данные в будущее и не выдавай сглаживание за прогноз;',
    '',
    summaryText ? `Локальная сводка приложения: ${summaryText}` : '',
    '',
    'ДАННЫЕ ДЛЯ АНАЛИЗА',
    ...sections,
  ]
    .filter(Boolean)
    .join('\n');

  return constrainPrompt(prompt);
}

function buildReadableSections(payload: AiReportPayload): string[] {
  const lines: string[] = [];
  const summary = payload.summary;

  appendSection(lines, 'Сводка', [
    `Записей с данными: ${summary.coveredEntriesCount}; обычных дней: ${summary.ordinaryCoveredEntriesCount}; необычных дней: ${summary.specialDays}.`,
    metricLine('Сон', summary.averageSleep === null ? null : formatMinutes(Math.round(summary.averageSleep)), summary.sleepSamples),
    metricLine(
      'Время в кровати',
      summary.averageTimeInBed === null ? null : formatMinutes(Math.round(summary.averageTimeInBed)),
      summary.timeInBedSamples,
    ),
    metricLine('Энергия', formatDecimal(summary.averageEnergy), summary.energySamples, '/ 5'),
    metricLine('Качество сна', formatDecimal(summary.averageSleepQuality), summary.sleepQualitySamples, '/ 5'),
    schemaCoverageLine(payload.entries),
    `Работа: отмечена в ${summary.careerDays} из ${summary.careerSamples} заполненных дней этого блока.`,
    `Физическая активность: ${summary.movementDays} из ${summary.movementSamples} отмеченных дней.`,
    `Питание: соответствовало правилам — ${summary.nutritionSupportDays}, мешало — ${summary.nutritionBlockDays}, всего отметок — ${summary.nutritionSamples}.`,
    `Действия по цели: шаг к цели — ${summary.externalActionDays}, подготовка — ${summary.preparationDays}, занимался другим — ${summary.driftDays}; всего отметок — ${summary.actionDirectionSamples}.`,
    metricLine('Вес', formatDecimal(summary.averageWeightKg), summary.weightSamples, 'кг'),
  ]);

  appendSection(lines, 'Текущие определения', [
    `Блоки, доступные в ежедневной записи: ${payload.settingsSnapshot.activeDailyBlocks.length ? payload.settingsSnapshot.activeDailyBlocks.map((id) => labelFor(dailyBlockOptions, id)).join(', ') : 'все необязательные блоки скрыты'}.`,
    payload.settingsSnapshot.activeFocusTitle ? `Текущая цель: ${cleanText(payload.settingsSnapshot.activeFocusTitle)}.` : '',
    payload.settingsSnapshot.focusOutcomeCriterion
      ? `Наблюдаемый результат цели: ${cleanText(payload.settingsSnapshot.focusOutcomeCriterion)}.`
      : '',
    payload.settingsSnapshot.focusReviewDate ? `Цель нужно пересмотреть ${payload.settingsSnapshot.focusReviewDate}.` : '',
    payload.settingsSnapshot.externalEvidenceCriterion
      ? `Что считается конкретным действием: ${cleanText(payload.settingsSnapshot.externalEvidenceCriterion)}.`
      : '',
    payload.settingsSnapshot.nutritionGoalCriterion
      ? `Правила питания: ${cleanText(payload.settingsSnapshot.nutritionGoalCriterion)}.`
      : '',
    formatExperiment(payload.settingsSnapshot.experiment),
    formatExperimentSummary(payload.experimentSummary),
  ]);

  let entryLimit = payload.entries.length;
  if (payload.period === 'week') {
    entryLimit = 7;
  } else if (payload.period === 'month') {
    entryLimit = 31;
  }
  appendSection(
    lines,
    'Автоматические наблюдения приложения',
    payload.observations.map((item) => `${item.title}: ${item.text}`),
  );
  appendSection(lines, 'Повторяющиеся факторы дня', payload.factorSummaries.map(formatFactorSummary));
  appendSection(lines, 'Сохранённые обзоры', limitedValues(reviewLines(payload), 18, 1_600));
  appendSection(
    lines,
    payload.period === 'range' && payload.rangeMonths ? 'Покрытие по месяцам' : 'Записи по дням',
    payload.period === 'range' && payload.rangeMonths
      ? monthlyEntryLines(payload)
      : limitedValues(
          payload.entries.map((entry) => formatEntry(entry, payload)),
          entryLimit,
          1_600,
        ),
  );
  appendSection(
    lines,
    'Завершённые итоги',
    limitedValues(
      payload.results.map((result) => {
        const note = cleanText(result.note);
        return `${result.date} — ${labelFor(payload.labels.resultAreas, result.area)}: ${cleanText(result.title)}${note ? `; подробности: ${note}` : ''}`;
      }),
      payload.period === 'range' ? 80 : 60,
      payload.period === 'range' ? 400 : 800,
    ),
  );
  appendSection(
    lines,
    'События, мысли и наблюдения',
    limitedValues(
      payload.lifeEvents.map((event) => {
        const note = cleanText(event.note);
        return `${event.date} — ${labelFor(payload.labels.eventTypes, event.type)}: ${cleanText(event.title)}${note ? `; ${note}` : ''}`;
      }),
      payload.period === 'range' ? 60 : 60,
      payload.period === 'range' ? 600 : 1_000,
    ),
  );
  appendSection(
    lines,
    'Завершённые эксперименты',
    limitedValues(
      payload.experimentHistory.map(({ record, summary }) => formatCompletedExperiment(record, summary)),
      24,
      1_600,
    ),
  );

  return lines;
}

function monthlyEntryLines(payload: AiReportPayload): string[] {
  const byMonth = new Map<string, DailyEntry[]>();
  for (const entry of payload.entries) {
    const month = entry.date.slice(0, 7);
    byMonth.set(month, [...(byMonth.get(month) ?? []), entry]);
  }

  return [...byMonth.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([month, entries]) => {
      const summary = summarize(entries);
      const values = [
        `${summary.coveredEntriesCount} записей`,
        summary.averageSleep === null ? '' : `сон ${formatMinutes(Math.round(summary.averageSleep))} (${summary.sleepSamples})`,
        summary.averageEnergy === null ? '' : `энергия ${formatDecimal(summary.averageEnergy)}/5 (${summary.energySamples})`,
        summary.averageSleepQuality === null
          ? ''
          : `качество сна ${formatDecimal(summary.averageSleepQuality)}/5 (${summary.sleepQualitySamples})`,
        summary.averageWeightKg === null ? '' : `вес ${formatDecimal(summary.averageWeightKg)} кг (${summary.weightSamples})`,
        `действия по цели ${summary.externalActionDays}/${summary.actionDirectionSamples}`,
      ].filter(Boolean);
      return `${formatDate(`${month}-01`, { month: 'long', year: 'numeric' })}: ${values.join('; ')}.`;
    });
}

function limitedValues(values: string[], maxItems: number, maxLineLength: number): string[] {
  const limited = values.slice(0, maxItems).map((value) => clipText(value, maxLineLength));
  if (values.length > maxItems) {
    limited.push(`Не включено подробностей: ${values.length - maxItems}. Они остаются в полном JSON-экспорте.`);
  }
  return limited;
}

function clipText(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, Math.max(0, maxLength - 34)).trimEnd()}… [подробности сокращены]`;
}

function constrainPrompt(prompt: string): string {
  if (prompt.length <= AI_PROMPT_CHARACTER_LIMIT) {
    return prompt;
  }
  const notice = '\n\n[Пакет сокращён до безопасного объёма. Остальные подробности доступны в полном JSON-экспорте.]';
  const boundary = AI_PROMPT_CHARACTER_LIMIT - notice.length;
  const lastLineBreak = prompt.lastIndexOf('\n', boundary);
  return `${prompt.slice(0, lastLineBreak > 0 ? lastLineBreak : boundary).trimEnd()}${notice}`;
}

function appendSection(target: string[], title: string, values: string[]) {
  const present = values.filter(Boolean);
  target.push('', `${title}:`);
  target.push(...(present.length ? present.map((value) => `- ${value}`) : ['- Нет данных.']));
}

function metricLine(label: string, value: string | null, samples: number, suffix = ''): string {
  if (value === null || samples === 0) {
    return '';
  }
  return `${label}: ${value}${suffix ? ` ${suffix}` : ''} (${samples} ${sampleWord(samples)}).`;
}

function schemaCoverageLine(entries: DailyEntry[]): string {
  const known = entries.filter((entry) => entry.entrySchemaVersion !== null && entry.activeDailyBlocksSnapshot !== null);
  const legacyCount = entries.length - known.length;
  const parts = [`состав показанных блоков сохранён для ${known.length} из ${entries.length} записей`];
  if (legacyCount) {
    parts.push(`для ${legacyCount} старых записей он неизвестен`);
  }
  return `Контекст формы: ${parts.join('; ')}.`;
}

function sampleWord(value: number): string {
  const mod100 = value % 100;
  const mod10 = value % 10;
  if (mod100 >= 11 && mod100 <= 14) {
    return 'измерений';
  }
  if (mod10 === 1) {
    return 'измерение';
  }
  if (mod10 >= 2 && mod10 <= 4) {
    return 'измерения';
  }
  return 'измерений';
}

function formatDecimal(value: number | null): string | null {
  return value === null ? null : value.toLocaleString('ru-RU', { maximumFractionDigits: 1 });
}

function cleanText(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function labelFor(options: Array<{ id: string; label: string }>, id: string): string {
  return options.find((option) => option.id === id)?.label ?? 'Неизвестное значение';
}

function formatEntry(entry: DailyEntry, payload: AiReportPayload): string {
  const values: string[] = [];
  appendEntryFocus(values, entry, payload);
  appendEntryState(values, entry);
  appendEntryContext(values, entry, payload);
  appendEntryActions(values, entry, payload);
  appendEntryOutcome(values, entry, payload);
  return `${entry.date} — ${values.length ? values.join('; ') : 'есть запись без заполненных показателей'}.`;
}

function appendEntryFocus(values: string[], entry: DailyEntry, payload: AiReportPayload): void {
  if (entry.focusTitle && entry.focusTitle !== payload.settingsSnapshot.activeFocusTitle) {
    values.push(`цель на эту дату: ${cleanText(entry.focusTitle)}`);
  }
  if (entry.focusOutcomeCriterion && entry.focusOutcomeCriterion !== payload.settingsSnapshot.focusOutcomeCriterion) {
    values.push(`ожидаемый результат на эту дату: ${cleanText(entry.focusOutcomeCriterion)}`);
  }
  if (entry.focusReviewDate && entry.focusReviewDate !== payload.settingsSnapshot.focusReviewDate) {
    values.push(`дата пересмотра цели на эту дату: ${entry.focusReviewDate}`);
  }
}

function appendEntryState(values: string[], entry: DailyEntry): void {
  if (entry.bedtime) {
    values.push(`лёг ${entry.bedtime}`);
  }
  if (entry.wakeTime) {
    values.push(`встал ${entry.wakeTime}`);
  }
  if (entry.sleepMinutes !== null) {
    values.push(`сон ${formatMinutes(entry.sleepMinutes)}`);
  }
  if (entry.timeInBedMinutes !== null) {
    values.push(`в кровати ${formatMinutes(entry.timeInBedMinutes)}`);
  }
  if (entry.sleepQuality !== null) {
    values.push(`качество сна ${entry.sleepQuality}/5`);
  }
  if (entry.energy !== null) {
    values.push(`энергия ${entry.energy}/5`);
  }
}

function appendEntryContext(values: string[], entry: DailyEntry, payload: AiReportPayload): void {
  if (dailyFieldWasRecorded(entry, 'contextFactors')) {
    const factors = entry.contextFactors.map((id) => labelFor(payload.labels.contextFactors, id));
    values.push(`условия дня: ${factors.length ? factors.join(', ') : 'ничего из списка'}`);
  }
  if (cleanText(entry.contextNote)) {
    values.push(`контекст: ${cleanText(entry.contextNote)}`);
  }
  if (entry.specialDay) {
    values.push(
      `необычный день: ${labelFor(payload.labels.specialDays, entry.specialDay)}${entry.specialDayNote ? ` (${cleanText(entry.specialDayNote)})` : ''}`,
    );
  }
}

function appendEntryActions(values: string[], entry: DailyEntry, payload: AiReportPayload): void {
  let careerStates = entry.careerStates;
  if (!careerStates.length && entry.careerState) {
    careerStates = [entry.careerState];
  }
  if (dailyFieldWasRecorded(entry, 'careerStates')) {
    values.push(
      `работа: ${careerStates.length ? careerStates.map((id) => labelFor(payload.labels.career, id)).join(', ') : 'ничего из списка'}`,
    );
  }
  if (dailyFieldWasRecorded(entry, 'actionDirection')) {
    values.push(
      entry.actionDirection
        ? `по цели: ${labelFor(payload.labels.actionDirections, entry.actionDirection)}${entry.actionNote ? ` (${cleanText(entry.actionNote)})` : ''}`
        : 'по цели: действий не было',
    );
  }
  if (dailyFieldWasRecorded(entry, 'activities')) {
    const activities = entry.activities.map((id) => labelFor(payload.labels.activities, id));
    values.push(`активность: ${activities.length ? activities.join(', ') : 'не было'}`);
  }
}

function appendEntryOutcome(values: string[], entry: DailyEntry, payload: AiReportPayload): void {
  if (entry.nutritionState) {
    values.push(
      `питание: ${labelFor(payload.labels.nutrition, entry.nutritionState)}${entry.nutritionNote ? ` (${cleanText(entry.nutritionNote)})` : ''}`,
    );
  }
  if (entry.weightKg !== null) {
    values.push(`вес ${formatDecimal(entry.weightKg)} кг`);
  }
  if (dailyFieldWasRecorded(entry, 'lifeAreas')) {
    const areas = entry.lifeAreas.map((id) => labelFor(payload.labels.lifeAreas, id));
    values.push(`области жизни: ${areas.length ? areas.join(', ') : 'ничего не отмечено'}`);
  }
  if (cleanText(entry.importantFact)) {
    values.push(`заметка пользователя: ${cleanText(entry.importantFact)}`);
  }
  if (entry.experimentCompleted !== null) {
    values.push(`условие эксперимента: ${entry.experimentCompleted ? 'выполнено' : 'не выполнено'}`);
  }
  if (entry.experimentNote) {
    values.push(`заметка к эксперименту: ${cleanText(entry.experimentNote)}`);
  }
}

function formatFactorSummary(factor: AiReportPayload['factorSummaries'][number]): string {
  const values = [`${factor.label}: ${factor.count} дн.`];
  if (factor.sleepSamples || factor.sleepSamplesWithout) {
    values.push(
      `сон с фактором ${factor.averageSleep === null ? 'нет данных' : formatMinutes(Math.round(factor.averageSleep))} (${factor.sleepSamples}), без него ${factor.averageSleepWithout === null ? 'нет данных' : formatMinutes(Math.round(factor.averageSleepWithout))} (${factor.sleepSamplesWithout})`,
    );
  }
  if (factor.energySamples || factor.energySamplesWithout) {
    values.push(
      `энергия с фактором ${formatDecimal(factor.averageEnergy) ?? 'нет данных'} (${factor.energySamples}), без него ${formatDecimal(factor.averageEnergyWithout) ?? 'нет данных'} (${factor.energySamplesWithout})`,
    );
  }
  return values.join('; ');
}

function formatExperiment(experiment: AppSettings['experiment'] | null): string {
  if (!experiment) {
    return '';
  }
  if (!experiment.active && !cleanText(experiment.title)) {
    return '';
  }
  const values = [cleanText(experiment.title) || 'без названия'];
  if (cleanText(experiment.hypothesis)) {
    values.push(`что пользователь хочет проверить: ${cleanText(experiment.hypothesis)}`);
  }
  if (experiment.startDate || experiment.endDate) {
    values.push(`даты: ${experiment.startDate || 'не указано'} — ${experiment.endDate || 'не указано'}`);
  }
  if (cleanText(experiment.conclusion)) {
    values.push(`итог: ${cleanText(experiment.conclusion)}`);
  }
  return `Эксперимент: ${values.join('; ')}.`;
}

function formatExperimentSummary(summary: ExperimentSummary | null): string {
  if (!summary) {
    return '';
  }
  const metrics = summary.metrics.map(
    (metric) =>
      `${metric.label}: до ${formatExperimentMetricValue(metric.baselineAverage, metric.id)} (${metric.baselineSamples}), во время ${formatExperimentMetricValue(metric.experimentAverage, metric.id)} (${metric.experimentSamples})`,
  );
  return `Сводка эксперимента: условие выполнено в ${summary.adherenceCompletedDays} из ${summary.adherenceMarkedDays} отмеченных дней, не выполнено в ${summary.adherenceNotCompletedDays}, без отметки — ${summary.adherenceUnmarkedDays}; ${metrics.length ? metrics.join('; ') : 'сопоставимых числовых данных нет'}. Это фактическая сводка, а не автоматический вывод о результате или причине.`;
}

function formatExperimentMetricValue(value: number | null, metricId: ExperimentMetricId): string {
  if (value === null) {
    return 'нет данных';
  }
  if (metricId === 'sleepMinutes' || metricId === 'timeInBedMinutes') {
    return formatMinutes(Math.round(value));
  }
  if (metricId === 'sleepQuality' || metricId === 'energy') {
    return `${formatDecimal(value)}/5`;
  }
  return `${formatDecimal(value)} кг`;
}

function formatCompletedExperiment(record: ExperimentRecord, summary: ExperimentSummary | null): string {
  const values = [
    `${record.startDate} — ${record.endDate}: ${cleanText(record.title)}`,
    record.hypothesis && `проверял: ${cleanText(record.hypothesis)}`,
    `вывод пользователя: ${cleanText(record.conclusion)}`,
    record.decision && `решение: ${experimentDecisionLabel(record.decision).toLocaleLowerCase('ru-RU')}`,
    formatExperimentSummary(summary),
  ].filter(Boolean);
  return values.join('; ');
}

function reviewLines(payload: AiReportPayload): string[] {
  const lines: string[] = [];
  if (payload.previousWeeklyReview) {
    lines.push(formatWeeklyReview('Предыдущая неделя', payload.previousWeeklyReview));
  }
  if (payload.weeklyReview) {
    lines.push(formatWeeklyReview('Текущая неделя', payload.weeklyReview));
  }
  for (const review of payload.weeklyReviews ?? []) {
    lines.push(formatWeeklyReview(review.weekStart, review));
  }
  if (payload.previousMonthlyReview) {
    lines.push(formatMonthlyReview('Предыдущий месяц', payload.previousMonthlyReview));
  }
  if (payload.monthlyReview) {
    lines.push(formatMonthlyReview('Текущий месяц', payload.monthlyReview));
  }
  for (const review of payload.monthlyReviews ?? []) {
    lines.push(formatMonthlyReview(review.monthStart, review));
  }
  return lines;
}

function formatWeeklyReview(label: string, review: WeeklyReview): string {
  const values = [
    review.previousPlanOutcome && `проверка прошлого решения: ${cleanText(review.previousPlanOutcome)}`,
    review.results.filter(Boolean).length && `итоги: ${review.results.filter(Boolean).map(cleanText).join('; ')}`,
    review.highlights.filter(Boolean).length && `важные события и мысли: ${review.highlights.filter(Boolean).map(cleanText).join('; ')}`,
    review.stateContext && `состояние и условия: ${cleanText(review.stateContext)}`,
    review.support && `помогало: ${cleanText(review.support)}`,
    review.obstacle && `мешало: ${cleanText(review.obstacle)}`,
    review.nextLever && `следующее изменение: ${cleanText(review.nextLever)}`,
    review.ifThenPlan && `план если-то: ${cleanText(review.ifThenPlan)}`,
  ].filter(Boolean);
  const coverage = review.coveredThrough ? `, ответы собраны по ${review.coveredThrough}` : '';
  return `${label} (${review.weekStart}${coverage}): ${values.length ? values.join('; ') : 'обзор сохранён без текста'}.`;
}

function formatMonthlyReview(label: string, review: MonthlyReview): string {
  const values = [
    review.mainPattern && `повторялось: ${cleanText(review.mainPattern)}`,
    review.support && `помогало: ${cleanText(review.support)}`,
    review.obstacle && `мешало: ${cleanText(review.obstacle)}`,
    review.courseChange && `изменило месяц: ${cleanText(review.courseChange)}`,
    review.nextFocus && `следующая цель: ${cleanText(review.nextFocus)}`,
    review.ifThenPlan && `план если-то: ${cleanText(review.ifThenPlan)}`,
  ].filter(Boolean);
  return `${label} (${review.monthStart}): ${values.length ? values.join('; ') : 'обзор сохранён без текста'}.`;
}
