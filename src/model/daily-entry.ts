import { actionDirectionOptions, dailyBlockOptions, knownActivityOptions, nutritionOptions, specialDayOptions } from './options';
import { removedDemoCareerOptionId, removedDemoContextFactorId, validDate } from './normalization';
import { currentDailyEntrySchemaVersion } from './schema';
import type {
  ActionDirectionId,
  ActivityId,
  CareerState,
  ContextFactorId,
  DailyBlockId,
  DailyEntry,
  DailyRecordedFieldId,
  LifeAreaId,
  NutritionState,
  SpecialDayId,
} from './schema';

const dailyRecordedFieldIds: DailyRecordedFieldId[] = [
  'bedtime',
  'wakeTime',
  'sleepMinutes',
  'timeInBedMinutes',
  'sleepQuality',
  'energy',
  'contextFactors',
  'contextNote',
  'specialDay',
  'careerStates',
  'activities',
  'nutritionState',
  'nutritionNote',
  'weightKg',
  'actionDirection',
  'actionNote',
  'lifeAreas',
  'importantFact',
  'experimentCompleted',
  'experimentNote',
];

function isNutritionState(value: unknown): value is NutritionState {
  return typeof value === 'string' && nutritionOptions.some((option) => option.id === value);
}

function isActionDirection(value: unknown): value is ActionDirectionId {
  return typeof value === 'string' && actionDirectionOptions.some((option) => option.id === value);
}

function nullableNumber(value: unknown, min: number, max: number, integer = false): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    return null;
  }
  return integer && !Number.isInteger(value) ? null : value;
}

function validTime(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{2}:\d{2}$/.test(value)) {
    return '';
  }
  const [hours, minutes] = value.split(':').map(Number);
  return hours! <= 23 && minutes! <= 59 ? value : '';
}

export function emptyDailyEntry(date: string): DailyEntry {
  return {
    date,
    entrySchemaVersion: currentDailyEntrySchemaVersion,
    activeDailyBlocksSnapshot: null,
    recordedFields: [],
    bedtime: '',
    wakeTime: '',
    sleepMinutes: null,
    timeInBedMinutes: null,
    sleepQuality: null,
    energy: null,
    contextFactors: [],
    contextFactorsRecorded: false,
    contextNote: '',
    specialDay: null,
    specialDayNote: '',
    careerState: null,
    careerStates: [],
    activities: [],
    activitiesRecorded: false,
    nutritionState: null,
    nutritionNote: '',
    nutritionCriterion: '',
    weightKg: null,
    actionDirection: null,
    actionNote: '',
    focusTitle: '',
    focusOutcomeCriterion: '',
    focusReviewDate: '',
    externalEvidenceCriterion: '',
    lifeAreas: [],
    lifeAreasRecorded: false,
    importantFact: '',
    experimentId: null,
    experimentCompleted: null,
    experimentNote: '',
    updatedAt: new Date().toISOString(),
  };
}

type LegacyDailyEntry = Partial<DailyEntry> & {
  stateContext?: unknown;
  eveningFactors?: unknown;
  eveningFactorsRecorded?: unknown;
  eveningFactorNote?: unknown;
};

const recordedFieldFallbacks: Record<DailyRecordedFieldId, (entry: DailyEntry) => boolean> = {
  bedtime: (entry) => Boolean(entry.bedtime),
  wakeTime: (entry) => Boolean(entry.wakeTime),
  sleepMinutes: (entry) => entry.sleepMinutes !== null,
  timeInBedMinutes: (entry) => entry.timeInBedMinutes !== null,
  sleepQuality: (entry) => entry.sleepQuality !== null,
  energy: (entry) => entry.energy !== null,
  contextFactors: (entry) => entry.contextFactorsRecorded,
  contextNote: (entry) => Boolean(entry.contextNote.trim()),
  specialDay: (entry) => entry.specialDay !== null,
  careerStates: (entry) => entry.careerStates.length > 0 || entry.careerState !== null,
  activities: (entry) => entry.activitiesRecorded,
  nutritionState: (entry) => entry.nutritionState !== null,
  nutritionNote: (entry) => Boolean(entry.nutritionNote.trim()),
  weightKg: (entry) => entry.weightKg !== null,
  actionDirection: (entry) => entry.actionDirection !== null,
  actionNote: (entry) => Boolean(entry.actionNote.trim()),
  lifeAreas: (entry) => entry.lifeAreasRecorded,
  importantFact: (entry) => Boolean(entry.importantFact.trim()),
  experimentCompleted: (entry) => entry.experimentCompleted !== null,
  experimentNote: (entry) => Boolean(entry.experimentNote.trim()),
};

function stringOrEmpty(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function booleanOrDefault(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function normalizedCareerStates(entry: LegacyDailyEntry): CareerState[] {
  let source: CareerState[] = [];
  if (Array.isArray(entry.careerStates)) {
    source = entry.careerStates.filter((state): state is CareerState => typeof state === 'string');
  } else if (typeof entry.careerState === 'string') {
    source = [entry.careerState];
  }
  return Array.from(new Set(source.map((state) => (state === removedDemoCareerOptionId ? 'external' : state))));
}

function normalizedActivities(value: unknown): ActivityId[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return Array.from(
    new Set(
      value.filter(
        (activity): activity is ActivityId =>
          typeof activity === 'string' &&
          (knownActivityOptions.some((option) => option.id === activity) || activity.startsWith('custom:activity:')),
      ),
    ),
  );
}

function sourceContextFactors(entry: LegacyDailyEntry): unknown[] {
  if (Array.isArray(entry.contextFactors)) {
    return entry.contextFactors;
  }
  return Array.isArray(entry.eveningFactors) ? entry.eveningFactors : [];
}

function normalizedContextNote(entry: LegacyDailyEntry): string {
  if (typeof entry.contextNote === 'string') {
    return entry.contextNote;
  }
  return [entry.stateContext, entry.eveningFactorNote]
    .filter((note): note is string => typeof note === 'string' && note.trim().length > 0)
    .join('\n');
}

function normalizedSpecialDay(value: unknown): SpecialDayId | null {
  return typeof value === 'string' && specialDayOptions.some((option) => option.id === value) ? (value as SpecialDayId) : null;
}

function normalizedLifeAreas(value: unknown): LifeAreaId[] {
  return Array.isArray(value) ? value.filter((area): area is LifeAreaId => typeof area === 'string') : [];
}

function normalizedExperimentId(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function normalizedEntrySchemaVersion(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null;
}

function normalizedDailyBlocks(value: unknown): DailyBlockId[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  return Array.from(new Set(value.filter((block): block is DailyBlockId => dailyBlockOptions.some((option) => option.id === block))));
}

export function normalizeDailyEntry(entry: LegacyDailyEntry & { date: string }): DailyEntry {
  const careerStates = normalizedCareerStates(entry);
  const activities = normalizedActivities(entry.activities);
  const contextFactorSource = sourceContextFactors(entry);
  const contextFactors = contextFactorSource.filter(
    (factor): factor is ContextFactorId => typeof factor === 'string' && factor !== removedDemoContextFactorId,
  );
  const contextNote = normalizedContextNote(entry);
  const specialDay = normalizedSpecialDay(entry.specialDay);
  const bedtime = validTime(entry.bedtime);
  const wakeTime = validTime(entry.wakeTime);
  const sleepMinutes = nullableNumber(entry.sleepMinutes, 0, 24 * 60, true);
  const timeInBedMinutes = nullableNumber(entry.timeInBedMinutes, 0, 18 * 60, true);
  const sleepQuality = nullableNumber(entry.sleepQuality, 1, 5, true);
  const energy = nullableNumber(entry.energy, 1, 5, true);
  const weightKg = nullableNumber(entry.weightKg, 30, 250);
  const nutritionState = isNutritionState(entry.nutritionState) ? entry.nutritionState : null;
  const nutritionNote = stringOrEmpty(entry.nutritionNote);
  const actionDirection = isActionDirection(entry.actionDirection) ? entry.actionDirection : null;
  const actionNote = stringOrEmpty(entry.actionNote);
  const lifeAreas = normalizedLifeAreas(entry.lifeAreas);
  const importantFact = stringOrEmpty(entry.importantFact);
  const experimentId = normalizedExperimentId(entry.experimentId);
  const experimentCompleted = typeof entry.experimentCompleted === 'boolean' ? entry.experimentCompleted : null;
  const experimentNote = stringOrEmpty(entry.experimentNote);
  const activitiesRecorded = booleanOrDefault(entry.activitiesRecorded, activities.length > 0);
  const lifeAreasRecorded = booleanOrDefault(entry.lifeAreasRecorded, lifeAreas.length > 0);
  let contextFactorsRecorded = contextFactorSource.length > 0;
  if (typeof entry.contextFactorsRecorded === 'boolean') {
    contextFactorsRecorded = entry.contextFactorsRecorded;
  } else if (typeof entry.eveningFactorsRecorded === 'boolean') {
    contextFactorsRecorded = entry.eveningFactorsRecorded;
  }
  const recordedFields = new Set<DailyRecordedFieldId>(
    Array.isArray(entry.recordedFields)
      ? entry.recordedFields.filter((field): field is DailyRecordedFieldId => dailyRecordedFieldIds.includes(field as DailyRecordedFieldId))
      : [],
  );
  const activeDailyBlocksSnapshot = normalizedDailyBlocks(entry.activeDailyBlocksSnapshot);

  const normalized: DailyEntry = {
    ...emptyDailyEntry(entry.date),
    entrySchemaVersion: normalizedEntrySchemaVersion(entry.entrySchemaVersion),
    activeDailyBlocksSnapshot,
    recordedFields: [],
    bedtime,
    wakeTime,
    sleepMinutes,
    timeInBedMinutes,
    sleepQuality,
    energy,
    careerState: careerStates[0] ?? null,
    careerStates,
    weightKg,
    activities,
    activitiesRecorded,
    nutritionState,
    nutritionNote,
    nutritionCriterion: stringOrEmpty(entry.nutritionCriterion),
    actionDirection,
    actionNote,
    focusTitle: stringOrEmpty(entry.focusTitle),
    focusOutcomeCriterion: stringOrEmpty(entry.focusOutcomeCriterion),
    focusReviewDate: validDate(entry.focusReviewDate),
    externalEvidenceCriterion: stringOrEmpty(entry.externalEvidenceCriterion),
    lifeAreas,
    lifeAreasRecorded,
    contextFactors,
    contextFactorsRecorded,
    contextNote,
    specialDay,
    specialDayNote: stringOrEmpty(entry.specialDayNote),
    importantFact,
    experimentId,
    experimentCompleted,
    experimentNote,
    updatedAt: stringOrEmpty(entry.updatedAt),
  };
  for (const field of dailyRecordedFieldIds) {
    if (recordedFieldFallbacks[field](normalized)) {
      recordedFields.add(field);
    }
  }
  normalized.recordedFields = Array.from(recordedFields);
  normalized.activitiesRecorded = recordedFields.has('activities');
  normalized.lifeAreasRecorded = recordedFields.has('lifeAreas');
  normalized.contextFactorsRecorded = recordedFields.has('contextFactors');
  return normalized;
}

export function dailyFieldWasRecorded(entry: DailyEntry, field: DailyRecordedFieldId): boolean {
  return entry.recordedFields.includes(field) || recordedFieldFallbacks[field](entry);
}
