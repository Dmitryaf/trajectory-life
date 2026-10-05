import type { ContextFactorId, DailyEntry, LifeEventRecord, Option, ResultRecord } from '@/types';
import { contextFactorOptions, externalCareerStates } from '@/types';
import { formatMinutes } from '@/services/dates';
import { dataCoverageLevel } from './coverage';
import { factorComparisonText, factorSummaries } from './observations';
import { summarize, type PeriodSummary } from './periodSummary';

export type ReviewCue = {
  id: string;
  title: string;
  text: string;
  tone: 'good' | 'warning' | 'neutral';
};

export function buildReviewCues(
  period: 'week' | 'month',
  entries: DailyEntry[],
  results: ResultRecord[],
  lifeEvents: LifeEventRecord[],
  externalCareerIds: string[] = externalCareerStates,
  factorOptions: Option<ContextFactorId>[] = contextFactorOptions,
): ReviewCue[] {
  const summary = summarize(entries, externalCareerIds);
  const factors = factorSummaries(entries, factorOptions);
  const cues: ReviewCue[] = [];
  const enoughEntries =
    period === 'week'
      ? summary.ordinaryCoveredEntriesCount >= 4 && summary.ordinaryCoreEntriesCount >= 2
      : summary.ordinaryCoveredEntriesCount >= 12 && summary.ordinaryCoreEntriesCount >= 6;
  const minTarget =
    period === 'week' ? '4 заполненных дня, из них 2 с основными полями' : '12 заполненных дней, из них 6 с основными полями';

  cues.push({
    id: 'coverage',
    title: enoughEntries ? 'Есть записи для сравнения' : 'Данных пока мало',
    text: enoughEntries
      ? `${summary.ordinaryCoveredEntriesCount} заполненных дней, из них ${summary.ordinaryCoreEntriesCount} с основными полями, можно посмотреть в обзоре.`
      : `Для сравнения записей ориентир — ${minTarget} без отметки «особый день». Сейчас: ${summary.ordinaryCoveredEntriesCount} и ${summary.ordinaryCoreEntriesCount}.`,
    tone: enoughEntries ? 'good' : 'warning',
  });

  appendSleepCues(cues, entries, summary);

  const leadingFactor = factors[0];
  if (leadingFactor && leadingFactor.count >= 2) {
    const comparison = factorComparisonText(leadingFactor);
    cues.push({
      id: 'factor',
      title: 'Повторяющееся условие',
      text: `Отметка «${leadingFactor.label}» встречалась ${leadingFactor.count} ${plural(leadingFactor.count, 'раз', 'раза', 'раз')}.${comparison ? ` ${comparison}` : ' Для сравнения пока мало записей.'}`,
      tone: 'warning',
    });
  }

  if (summary.externalSteps > 0 || summary.careerDays > 0) {
    cues.push({
      id: 'career',
      title: 'Работа была частью этого периода',
      text: `Работа отмечена в ${summary.careerDays} из ${summary.careerSamples} заполненных дней этого блока. Сравните эти дни с состоянием и другими условиями, не считая совпадение причиной.`,
      tone: 'neutral',
    });
  }

  appendDirectionCues(cues, summary);
  appendPeriodOutcomeCues(cues, summary, results, lifeEvents);

  return limitCues(cues, ['coverage', 'results', 'context']);
}

function appendSleepCues(cues: ReviewCue[], entries: DailyEntry[], summary: PeriodSummary): void {
  const shortSleepDays = entries.filter(
    (entry) => entry.specialDay === null && entry.sleepMinutes !== null && entry.sleepMinutes < 420,
  ).length;
  if (shortSleepDays >= 2) {
    cues.push({
      id: 'short-sleep',
      title: 'Были дни со сном меньше 7 часов',
      text: `${shortSleepDays} ${plural(shortSleepDays, 'день был', 'дня были', 'дней были')} со сном меньше 7 часов. Это стоит проверить перед выводами про действия и состояние.`,
      tone: 'warning',
    });
  } else if (summary.averageSleep !== null) {
    cues.push({ id: 'sleep-baseline', title: 'Сон за период', text: sleepContextText(summary), tone: 'neutral' });
  }
  const timingVariation = Math.max(summary.bedtimeVariationMinutes ?? 0, summary.wakeTimeVariationMinutes ?? 0);
  if (summary.sleepTimingSamples >= 4 && timingVariation >= 90) {
    cues.push({
      id: 'sleep-regularity',
      title: 'Время сна заметно менялось',
      text: `Разброс времени отхода ко сну или подъёма около ${Math.round(timingVariation)} мин.`,
      tone: 'neutral',
    });
  }
}

function appendDirectionCues(cues: ReviewCue[], summary: PeriodSummary): void {
  if (summary.preparationDays >= 3 && summary.externalActionDays <= 1) {
    cues.push({
      id: 'direction-preparation',
      title: 'Подготовка и шаги к цели',
      text: `${summary.preparationDays} ${plural(summary.preparationDays, 'день', 'дня', 'дней')} отмечены как подготовка, конкретных действий — ${summary.externalActionDays}. Проверьте, приводит ли подготовка к заметному результату.`,
      tone: 'warning',
    });
  } else if (summary.externalActionDays >= 2) {
    cues.push({
      id: 'direction-external',
      title: 'Были конкретные действия по цели',
      text: `${summary.externalActionDays} ${plural(summary.externalActionDays, 'день', 'дня', 'дней')} с действиями, после которых мог появиться заметный результат или обратная связь.`,
      tone: 'good',
    });
  }
  if (summary.driftDays >= 2) {
    cues.push({
      id: 'direction-drift',
      title: 'Другие дела занимали день',
      text: `${summary.driftDays} ${plural(summary.driftDays, 'день', 'дня', 'дней')} были заняты другими делами. Можно вернуться к заметкам и вспомнить, чем вы занимались.`,
      tone: 'warning',
    });
  }
}

function appendPeriodOutcomeCues(cues: ReviewCue[], summary: PeriodSummary, results: ResultRecord[], lifeEvents: LifeEventRecord[]): void {
  if (results.length) {
    cues.push({
      id: 'results',
      title: 'Сохранённые итоги',
      text: `${results.length} ${plural(results.length, 'итог', 'итога', 'итогов')} за период. Это итоги, которые вы сохранили отдельно от записи за день.`,
      tone: 'good',
    });
  }
  if (summary.nutritionBlockDays >= 2 || summary.nutritionSupportDays >= 3) {
    const blocksGoal = summary.nutritionBlockDays >= 2;
    cues.push({
      id: 'nutrition',
      title: blocksGoal ? 'Питание мешало цели' : 'Питание поддерживало цель',
      text: blocksGoal
        ? `${summary.nutritionBlockDays} ${plural(summary.nutritionBlockDays, 'день', 'дня', 'дней')} питание отмечено как мешающее цели. Лучше искать один повторяющийся сценарий, а не менять всё сразу.`
        : `${summary.nutritionSupportDays} ${plural(summary.nutritionSupportDays, 'день', 'дня', 'дней')} питание поддерживало цель. Можно посмотреть в заметках, что вы ели в эти дни.`,
      tone: blocksGoal ? 'warning' : 'good',
    });
  }
  if (summary.experimentMarkedDays >= 2) {
    cues.push({
      id: 'experiment',
      title: 'Есть данные эксперимента',
      text: `Получилось сделать выбранное изменение в ${summary.experimentCompletedDays} из ${summary.experimentMarkedDays} отмеченных дней. Посмотрите, что ещё менялось до и во время эксперимента.`,
      tone: 'neutral',
    });
  }
  if (summary.specialDays || lifeEvents.length) {
    cues.push({
      id: 'context',
      title: 'Особые дни и события',
      text: `${summary.specialDays} особых ${plural(summary.specialDays, 'день', 'дня', 'дней')} и ${lifeEvents.length} ${plural(lifeEvents.length, 'важное событие', 'важных события', 'важных событий')}. При сравнении с другими неделями или месяцами учитывайте эти обстоятельства.`,
      tone: 'neutral',
    });
  }
}

export function buildRangeReviewCues(
  rangeMonths: number,
  entries: DailyEntry[],
  results: ResultRecord[],
  lifeEvents: LifeEventRecord[],
  externalCareerIds: string[] = externalCareerStates,
  factorOptions: Option<ContextFactorId>[] = contextFactorOptions,
): ReviewCue[] {
  const summary = summarize(entries, externalCareerIds);
  const cues: ReviewCue[] = [];
  const coveredEntries = entries.filter((entry) => dataCoverageLevel(entry) > 0);
  const monthsWithData = new Set(coveredEntries.map((entry) => entry.date.slice(0, 7))).size;
  const enoughEntries =
    summary.ordinaryCoveredEntriesCount >= rangeMonths * 8 &&
    summary.ordinaryCoreEntriesCount >= rangeMonths * 4 &&
    monthsWithData >= Math.max(2, rangeMonths - 1);

  cues.push({
    id: 'coverage',
    title: enoughEntries ? 'Записи за выбранный период' : 'Записей для сравнения пока мало',
    text: `${summary.coveredEntriesCount} заполненных дней, из них ${summary.ordinaryCoreEntriesCount} с основными полями, в ${monthsWithData} из ${rangeMonths} мес.`,
    tone: enoughEntries ? 'good' : 'warning',
  });

  const factor = factorSummaries(entries, factorOptions).find((item) => item.count >= Math.max(3, rangeMonths));
  if (factor) {
    const comparison = factorComparisonText(factor);
    cues.push({
      id: 'factor',
      title: 'Повторяющееся условие',
      text: `Отметка «${factor.label}» встречалась ${factor.count} ${plural(factor.count, 'раз', 'раза', 'раз')}.${comparison ? ` ${comparison}` : ' Для сравнения пока мало записей.'}`,
      tone: 'neutral',
    });
  }

  if (summary.actionDirectionSamples >= Math.max(6, rangeMonths * 2)) {
    const externalRate = ratioPercent(summary.externalActionDays, summary.actionDirectionSamples) ?? 0;
    const preparationRate = ratioPercent(summary.preparationDays, summary.actionDirectionSamples) ?? 0;
    const driftRate = ratioPercent(summary.driftDays, summary.actionDirectionSamples) ?? 0;
    if (preparationRate >= 60 && externalRate <= 20) {
      cues.push({
        id: 'direction-preparation',
        title: 'Подготовка отмечалась чаще шагов к цели',
        text: `Подготовка — ${preparationRate}% отмеченных дней, шаги к цели — ${externalRate}%. Проверьте, что может привести к заметному результату.`,
        tone: 'warning',
      });
    } else if (externalRate >= 35) {
      cues.push({
        id: 'direction-external',
        title: 'Вы отмечали шаги к цели',
        text: `Конкретные действия появлялись в ${externalRate}% дней с отметкой по текущей цели. Сверьте это с итогами периода.`,
        tone: 'good',
      });
    }
    if (driftRate >= 30) {
      cues.push({
        id: 'direction-drift',
        title: 'Были дни с другими занятиями',
        text: `${driftRate}% дней с отметкой по текущей цели были заняты другим. Ищите повторяющееся условие, а не одну причину всего периода.`,
        tone: 'warning',
      });
    }
  }

  if (results.length) {
    cues.push({
      id: 'results',
      title: 'Сохранённые итоги',
      text: `${results.length} ${plural(results.length, 'итог', 'итога', 'итогов')} за период. Эти записи сохранены в Журнале.`,
      tone: 'good',
    });
  }

  if (summary.specialDays || lifeEvents.length) {
    cues.push({
      id: 'context',
      title: 'Особые дни и события',
      text: `${summary.specialDays} особых ${plural(summary.specialDays, 'день', 'дня', 'дней')} и ${lifeEvents.length} ${plural(lifeEvents.length, 'важное событие', 'важных события', 'важных событий')}. Дни с отметкой «особый день» не учитываются в средних значениях сна, энергии и веса; события показаны отдельно.`,
      tone: 'neutral',
    });
  }

  return limitCues(cues, ['coverage', 'results', 'context']);
}

export function ratioPercent(value: number, total: number): number | null {
  return total > 0 ? Math.round((value / total) * 100) : null;
}

function limitCues(cues: ReviewCue[], requiredIds: string[]): ReviewCue[] {
  const selected = cues.slice(0, 6);
  for (const id of requiredIds) {
    const required = cues.find((cue) => cue.id === id);
    if (!required || selected.some((cue) => cue.id === id)) {
      continue;
    }
    let replaceIndex = -1;
    for (let index = selected.length - 1; index >= 0; index -= 1) {
      if (!requiredIds.includes(selected[index].id)) {
        replaceIndex = index;
        break;
      }
    }
    if (replaceIndex >= 0) {
      selected[replaceIndex] = required;
    }
  }
  return selected.sort((a, b) => cues.indexOf(a) - cues.indexOf(b));
}

function sleepContextText(summary: PeriodSummary): string {
  const sleep = summary.averageSleep === null ? '—' : formatMinutes(Math.round(summary.averageSleep));
  const inBed = summary.averageTimeInBed === null ? '' : `, в кровати ${formatMinutes(Math.round(summary.averageTimeInBed))}`;
  const efficiency = summary.averageSleepEfficiency === null ? '' : `, доля сна около ${Math.round(summary.averageSleepEfficiency)}%`;
  return `Средний сон за период: ${sleep}${inBed}${efficiency}. Длительность сна и время в кровати показаны отдельно.`;
}

function plural(value: number, one: string, few: string, many: string): string {
  const mod10 = value % 10;
  const mod100 = value % 100;
  if (mod10 === 1 && mod100 !== 11) {
    return one;
  }
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return few;
  }
  return many;
}
