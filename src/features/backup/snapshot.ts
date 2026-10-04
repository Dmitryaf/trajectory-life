import {
  defaultSettings,
  normalizeDailyEntry,
  normalizeLifeEvent,
  normalizeMonthlyReview,
  normalizeResult,
  normalizeSettings,
  normalizeWeeklyReview,
  type AppSettings,
  type DailyEntry,
  type LifeEventRecord,
  type MonthlyReview,
  type ResultRecord,
  type WeeklyReview,
} from '@/types';
import { BACKUP_VERSION, MIN_SUPPORTED_BACKUP_VERSION } from '@/model/dataVersions';
import { experimentEntryLinkError, experimentIntegrityError, linkLegacyExperimentEntries } from '../experiments/model';
import { startOfMonth, startOfWeek } from '@/services/dates';

export type ExportPayload = {
  version: number;
  exportedAt: string;
  dailyEntries: DailyEntry[];
  results: ResultRecord[];
  lifeEvents?: LifeEventRecord[];
  weeklyReviews: WeeklyReview[];
  monthlyReviews?: MonthlyReview[];
  settings: AppSettings;
};

type UnknownRecord = Record<string, unknown>;

export function normalizeSnapshot(input: unknown): ExportPayload {
  const source = requireRecord(input, 'резервная копия');
  const version = source.version;
  if (!Number.isInteger(version) || (version as number) < MIN_SUPPORTED_BACKUP_VERSION || (version as number) > BACKUP_VERSION) {
    throw new Error('Неподдерживаемый формат резервной копии');
  }

  const settingsSource = source.settings === undefined ? undefined : requireRecord(source.settings, 'settings');
  const settings = settingsSource
    ? normalizeSettings(settingsSource as Partial<AppSettings>)
    : normalizeSettings({
        ...structuredClone(defaultSettings),
        firstUse: { ...structuredClone(defaultSettings.firstUse), status: 'available' },
      });
  requireExperimentInvariants(settings, settingsSource);
  const dailyEntries = linkLegacyExperimentEntries(
    requireArray(source.dailyEntries, 'dailyEntries').map((value, index) => {
      const entry = requireRecord(value, `dailyEntries[${index}]`);
      return normalizeDailyEntry({ ...entry, date: requireDate(entry.date, `dailyEntries[${index}].date`) });
    }),
    settings,
  );
  const results = requireArray(source.results, 'results').map((value, index) => normalizeSnapshotResult(value, index));
  const lifeEvents = optionalArray(source.lifeEvents, 'lifeEvents').map((value, index) => normalizeSnapshotLifeEvent(value, index));
  const weeklyReviews = optionalArray(source.weeklyReviews, 'weeklyReviews').map((value, index) => {
    const review = requireRecord(value, `weeklyReviews[${index}]`);
    return normalizeWeeklyReview({ ...review, weekStart: requireDate(review.weekStart, `weeklyReviews[${index}].weekStart`) });
  });
  const monthlyReviews = optionalArray(source.monthlyReviews, 'monthlyReviews').map((value, index) => {
    const review = requireRecord(value, `monthlyReviews[${index}]`);
    return normalizeMonthlyReview({ ...review, monthStart: requireDate(review.monthStart, `monthlyReviews[${index}].monthStart`) });
  });
  requireUniqueKeys(dailyEntries, (entry) => entry.date, 'dailyEntries.date');
  requireUniqueKeys(
    results.filter((result): result is ResultRecord & { id: number } => result.id !== undefined),
    (result) => result.id,
    'results.id',
  );
  requireUniqueKeys(
    lifeEvents.filter((event): event is LifeEventRecord & { id: number } => event.id !== undefined),
    (event) => event.id,
    'lifeEvents.id',
  );
  requireUniqueKeys(weeklyReviews, (review) => review.weekStart, 'weeklyReviews.weekStart');
  requireUniqueKeys(monthlyReviews, (review) => review.monthStart, 'monthlyReviews.monthStart');
  weeklyReviews.forEach((review, index) => {
    if (startOfWeek(review.weekStart) !== review.weekStart) {
      throw new Error(`weeklyReviews[${index}].weekStart должен быть понедельником`);
    }
  });
  monthlyReviews.forEach((review, index) => {
    if (startOfMonth(review.monthStart) !== review.monthStart) {
      throw new Error(`monthlyReviews[${index}].monthStart должен быть первым днём месяца`);
    }
  });
  const entryLinkError = experimentEntryLinkError(dailyEntries, settings);
  if (entryLinkError) {
    throw new Error(entryLinkError);
  }
  return {
    version: version as number,
    exportedAt: typeof source.exportedAt === 'string' ? source.exportedAt : '',
    dailyEntries,
    results,
    lifeEvents,
    weeklyReviews,
    monthlyReviews,
    settings,
  };
}

function normalizeSnapshotLifeEvent(value: unknown, index: number): LifeEventRecord {
  const event = requireRecord(value, `lifeEvents[${index}]`);
  const id = event.id;
  if (id !== undefined && (!Number.isInteger(id) || (id as number) <= 0)) {
    throw new Error(`Некорректное поле lifeEvents[${index}].id`);
  }

  return normalizeLifeEvent({
    ...event,
    ...(typeof id === 'number' ? { id } : {}),
    date: requireDate(event.date, `lifeEvents[${index}].date`),
    title: requireString(event.title, `lifeEvents[${index}].title`),
  });
}

function normalizeSnapshotResult(value: unknown, index: number): ResultRecord {
  const result = requireRecord(value, `results[${index}]`);
  const id = result.id;
  if (id !== undefined && (!Number.isInteger(id) || (id as number) <= 0)) {
    throw new Error(`Некорректное поле results[${index}].id`);
  }

  return normalizeResult({
    ...(typeof id === 'number' ? { id } : {}),
    date: requireDate(result.date, `results[${index}].date`),
    area: requireString(result.area, `results[${index}].area`) as ResultRecord['area'],
    title: requireString(result.title, `results[${index}].title`),
    note: typeof result.note === 'string' ? result.note : '',
    createdAt: typeof result.createdAt === 'string' ? result.createdAt : '',
  });
}

function requireRecord(value: unknown, field: string): UnknownRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Некорректное поле ${field}`);
  }
  return value as UnknownRecord;
}

function requireArray(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`Некорректное поле ${field}`);
  }
  return value;
}

function optionalArray(value: unknown, field: string): unknown[] {
  if (value === undefined) {
    return [];
  }
  return requireArray(value, field);
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string') {
    throw new Error(`Некорректное поле ${field}`);
  }
  return value;
}

function requireDate(value: unknown, field: string): string {
  const date = requireString(value, field);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`Некорректная дата в ${field}`);
  }
  const [year, month, day] = date.split('-').map(Number);
  const parsed = new Date(year!, month! - 1, day!);
  if (parsed.getFullYear() !== year || parsed.getMonth() !== month! - 1 || parsed.getDate() !== day) {
    throw new Error(`Некорректная дата в ${field}`);
  }
  return date;
}

function requireUniqueKeys<T, K extends string | number>(items: T[], keyOf: (item: T) => K, field: string) {
  const seen = new Set<K>();
  for (const item of items) {
    const key = keyOf(item);
    if (seen.has(key)) {
      throw new Error(`Повторяющееся поле ${field}: ${key}`);
    }
    seen.add(key);
  }
}

function requireExperimentInvariants(settings: AppSettings, source: UnknownRecord | undefined) {
  const rawHistory = Array.isArray(source?.experimentHistory) ? source.experimentHistory : [];
  const rawIds = rawHistory.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return [];
    }
    const id = (item as UnknownRecord).id;
    return typeof id === 'string' && id.trim() ? [id.trim()] : [];
  });
  requireUniqueKeys(rawIds, (id) => id, 'settings.experimentHistory.id');
  rawHistory.forEach((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return;
    }
    const record = item as UnknownRecord;
    if (
      typeof record.startDate === 'string' &&
      typeof record.endDate === 'string' &&
      /^\d{4}-\d{2}-\d{2}$/.test(record.startDate) &&
      /^\d{4}-\d{2}-\d{2}$/.test(record.endDate) &&
      record.startDate > record.endDate
    ) {
      throw new Error(`Дата окончания завершённого эксперимента должна быть не раньше даты начала: settings.experimentHistory[${index}]`);
    }
  });

  const integrityError = experimentIntegrityError(settings);
  if (integrityError) {
    throw new Error(integrityError);
  }
}
