import type { ContextFactorId, DailyEntry, Option } from '@/types';
import { contextFactorOptions, dailyFieldWasRecorded } from '@/types';
import { formatMinutes } from '@/services/dates';
import { hasMovement } from './periodSummary';

export type Observation = {
  id: string;
  title: string;
  text: string;
};

export type FactorSummary = {
  id: ContextFactorId;
  label: string;
  icon?: string;
  count: number;
  averageSleep: number | null;
  averageSleepWithout: number | null;
  sleepSamples: number;
  sleepSamplesWithout: number;
  averageEnergy: number | null;
  averageEnergyWithout: number | null;
  energySamples: number;
  energySamplesWithout: number;
};

export function buildObservations(entries: DailyEntry[], factorOptions: Option<ContextFactorId>[] = contextFactorOptions): Observation[] {
  const observations: Observation[] = [];
  const ordinaryEntries = entries.filter((entry) => entry.specialDay === null);
  const energyEntries = ordinaryEntries.filter((entry) => entry.energy !== null);
  const movementMarkedEntries = energyEntries.filter((entry) => dailyFieldWasRecorded(entry, 'activities'));
  const movementEntries = movementMarkedEntries.filter(hasMovement);
  const stillEntries = movementMarkedEntries.filter((entry) => !hasMovement(entry));
  const restedEntries = energyEntries.filter((entry) => (entry.sleepMinutes ?? 0) >= 420);
  const shortSleepEntries = energyEntries.filter((entry) => entry.sleepMinutes !== null && entry.sleepMinutes < 420);
  const specialEntries = entries.filter((entry) => entry.specialDay !== null);

  const movementEnergy = average(movementEntries.map((entry) => entry.energy));
  const stillEnergy = average(stillEntries.map((entry) => entry.energy));
  if (
    movementEntries.length >= 4 &&
    stillEntries.length >= 4 &&
    movementEnergy !== null &&
    stillEnergy !== null &&
    Math.abs(movementEnergy - stillEnergy) >= 0.5
  ) {
    const direction = movementEnergy > stillEnergy ? 'выше' : 'ниже';
    observations.push({
      id: 'movement-energy',
      title: 'Физическая активность и энергия',
      text: `В дни с физической активностью энергия в среднем ${direction}: ${formatNumber(movementEnergy)} (измерений: ${movementEntries.length}) против ${formatNumber(stillEnergy)} без активности (измерений: ${stillEntries.length}).`,
    });
  }

  const restedEnergy = average(restedEntries.map((entry) => entry.energy));
  const shortSleepEnergy = average(shortSleepEntries.map((entry) => entry.energy));
  if (
    restedEntries.length >= 4 &&
    shortSleepEntries.length >= 4 &&
    restedEnergy !== null &&
    shortSleepEnergy !== null &&
    Math.abs(restedEnergy - shortSleepEnergy) >= 0.5
  ) {
    const direction = restedEnergy > shortSleepEnergy ? 'выше' : 'ниже';
    observations.push({
      id: 'sleep-energy',
      title: 'Сон и энергия',
      text: `После сна от 7 часов энергия в среднем ${direction}: ${formatNumber(restedEnergy)} (измерений: ${restedEntries.length}) против ${formatNumber(shortSleepEnergy)} после более короткого сна (измерений: ${shortSleepEntries.length}).`,
    });
  }

  if (specialEntries.length) {
    observations.push({
      id: 'special-days',
      title: 'Особые дни',
      text: `${specialEntries.length} ${plural(specialEntries.length, 'день отмечен', 'дня отмечены', 'дней отмечены')} как особые. Их стоит учитывать отдельно от обычного ритма.`,
    });
  }

  const leadingFactor = factorSummaries(entries, factorOptions)[0];
  if (leadingFactor && leadingFactor.count >= 2) {
    const details = factorComparisonText(leadingFactor);
    observations.push({
      id: 'context-factor',
      title: 'Повторяющееся условие',
      text: `Отметка «${leadingFactor.label}» встречалась ${leadingFactor.count} ${plural(leadingFactor.count, 'раз', 'раза', 'раз')}.${details ? ` ${details}` : ' Для сравнения пока мало обычных дней.'}`,
    });
  }

  return observations;
}

export function factorSummaries(entries: DailyEntry[], factorOptions: Option<ContextFactorId>[] = contextFactorOptions): FactorSummary[] {
  const ordinaryEntries = entries.filter((entry) => entry.specialDay === null);
  return factorOptions
    .map((option) => {
      const matching = ordinaryEntries.filter((entry) => entry.contextFactors.includes(option.id));
      const other = ordinaryEntries.filter(
        (entry) => dailyFieldWasRecorded(entry, 'contextFactors') && !entry.contextFactors.includes(option.id),
      );
      return {
        id: option.id,
        label: option.label,
        icon: option.icon,
        count: matching.length,
        averageSleep: average(matching.map((entry) => entry.sleepMinutes)),
        averageSleepWithout: average(other.map((entry) => entry.sleepMinutes)),
        sleepSamples: sampleCount(matching.map((entry) => entry.sleepMinutes)),
        sleepSamplesWithout: sampleCount(other.map((entry) => entry.sleepMinutes)),
        averageEnergy: average(matching.map((entry) => entry.energy)),
        averageEnergyWithout: average(other.map((entry) => entry.energy)),
        energySamples: sampleCount(matching.map((entry) => entry.energy)),
        energySamplesWithout: sampleCount(other.map((entry) => entry.energy)),
      };
    })
    .filter((summary) => summary.count > 0)
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

export function factorComparisonText(factor: FactorSummary): string {
  const parts: string[] = [];
  if (factor.sleepSamples >= 4 && factor.sleepSamplesWithout >= 4 && factor.averageSleep !== null && factor.averageSleepWithout !== null) {
    const difference = Math.round(factor.averageSleep - factor.averageSleepWithout);
    parts.push(
      `Сон с отметкой: ${formatMinutes(Math.round(factor.averageSleep))} (измерений: ${factor.sleepSamples}), без отметки: ${formatMinutes(Math.round(factor.averageSleepWithout))} (измерений: ${factor.sleepSamplesWithout}); разница ${signedMinutes(difference)}`,
    );
  }
  if (
    factor.energySamples >= 4 &&
    factor.energySamplesWithout >= 4 &&
    factor.averageEnergy !== null &&
    factor.averageEnergyWithout !== null
  ) {
    const difference = factor.averageEnergy - factor.averageEnergyWithout;
    parts.push(
      `энергия с отметкой: ${formatNumber(factor.averageEnergy)} (измерений: ${factor.energySamples}), без отметки: ${formatNumber(factor.averageEnergyWithout)} (измерений: ${factor.energySamplesWithout}); разница ${signedNumber(difference)}`,
    );
  }
  return parts.length ? `${parts.join('; ')}. Разница не доказывает, что причина именно в этом условии.` : '';
}

function average(values: Array<number | null>): number | null {
  const valid = values.filter((value): value is number => value !== null);
  if (!valid.length) {
    return null;
  }
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

function sampleCount(values: Array<number | null>): number {
  return values.filter((value) => value !== null).length;
}

function signedMinutes(value: number): string {
  if (value === 0) {
    return 'без разницы';
  }
  return `${value > 0 ? '+' : '−'}${formatMinutes(Math.abs(value))}`;
}

function signedNumber(value: number): string {
  if (Math.abs(value) < 0.05) {
    return 'без разницы';
  }
  return `${value > 0 ? '+' : '−'}${formatNumber(Math.abs(value))}`;
}

function formatNumber(value: number): string {
  return value.toFixed(1).replace('.0', '');
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
