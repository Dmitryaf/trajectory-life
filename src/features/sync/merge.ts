import { BACKUP_VERSION } from '@/model/dataVersions';
import type { LifeEventRecord, ResultRecord } from '@/types';
import { normalizeSnapshot, type ExportPayload } from '../backup/snapshot';

type KeyedRecord = Record<string, unknown>;

export type CloudMergeConflict = {
  path: string;
  kind: 'both_changed' | 'edit_delete';
};

export class CloudMergeConflictError extends Error {
  constructor(public readonly conflicts: CloudMergeConflict[]) {
    super('Локальная и облачная версии содержат несовместимые изменения');
    this.name = 'CloudMergeConflictError';
  }
}

export function mergeCloudSnapshots(baseInput: unknown, localInput: unknown, remoteInput: unknown): ExportPayload {
  const base = normalizeSnapshot(baseInput);
  const local = normalizeSnapshot(localInput);
  const remote = normalizeSnapshot(remoteInput);
  const conflicts: CloudMergeConflict[] = [];

  const merged = normalizeSnapshot({
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    dailyEntries: mergeKeyed(base.dailyEntries, local.dailyEntries, remote.dailyEntries, (entry) => entry.date, 'dailyEntries', conflicts),
    results: mergeJournalRecords(base.results, local.results, remote.results, 'results', conflicts),
    lifeEvents: mergeJournalRecords(base.lifeEvents ?? [], local.lifeEvents ?? [], remote.lifeEvents ?? [], 'lifeEvents', conflicts),
    weeklyReviews: mergeKeyed(
      base.weeklyReviews,
      local.weeklyReviews,
      remote.weeklyReviews,
      (review) => review.weekStart,
      'weeklyReviews',
      conflicts,
    ),
    monthlyReviews: mergeKeyed(
      base.monthlyReviews ?? [],
      local.monthlyReviews ?? [],
      remote.monthlyReviews ?? [],
      (review) => review.monthStart,
      'monthlyReviews',
      conflicts,
    ),
    settings: mergeObjectFields(base.settings, local.settings, remote.settings, 'settings', conflicts),
  });

  if (conflicts.length) {
    throw new CloudMergeConflictError(conflicts);
  }
  return merged;
}

function mergeKeyed<T extends object>(
  base: T[],
  local: T[],
  remote: T[],
  keyOf: (item: T) => string,
  path: string,
  conflicts: CloudMergeConflict[],
): T[] {
  const baseByKey = new Map(base.map((item) => [keyOf(item), item]));
  const localByKey = new Map(local.map((item) => [keyOf(item), item]));
  const remoteByKey = new Map(remote.map((item) => [keyOf(item), item]));
  const keys = new Set([...baseByKey.keys(), ...localByKey.keys(), ...remoteByKey.keys()]);
  const merged: T[] = [];

  for (const key of keys) {
    const value = mergeValue(baseByKey.get(key), localByKey.get(key), remoteByKey.get(key), `${path}[${key}]`, conflicts);
    if (value !== undefined) {
      merged.push(value as T);
    }
  }
  return merged;
}

function mergeJournalRecords<T extends ResultRecord | LifeEventRecord>(
  base: T[],
  local: T[],
  remote: T[],
  path: string,
  conflicts: CloudMergeConflict[],
): T[] {
  const keyOf = (item: T) => String(item.id);
  const baseKeys = new Set(base.map(keyOf));
  const remoteByKey = new Map(remote.map((item) => [keyOf(item), item]));
  const localByKey = new Map(local.map((item) => [keyOf(item), item]));
  const collisions = [...localByKey.keys()].filter(
    (key) => !baseKeys.has(key) && remoteByKey.has(key) && !same(localByKey.get(key), remoteByKey.get(key)),
  );
  if (!collisions.length) {
    return mergeKeyed(base, local, remote, keyOf, path, conflicts);
  }

  let nextId =
    Math.max(0, ...base.map((item) => item.id ?? 0), ...local.map((item) => item.id ?? 0), ...remote.map((item) => item.id ?? 0)) + 1;
  const remappedLocal = local.map((item) => (collisions.includes(keyOf(item)) ? ({ ...item, id: nextId++ } as T) : item));
  return mergeKeyed(base, remappedLocal, remote, keyOf, path, conflicts);
}

function mergeValue(base: unknown, local: unknown, remote: unknown, path: string, conflicts: CloudMergeConflict[]): unknown {
  if (same(local, remote)) {
    return local;
  }
  if (same(local, base)) {
    return remote;
  }
  if (same(remote, base)) {
    return local;
  }
  if (local === undefined || remote === undefined) {
    conflicts.push({ path, kind: 'edit_delete' });
    return local;
  }
  if (isRecord(local) && isRecord(remote)) {
    return mergeObjectFields(isRecord(base) ? base : {}, local, remote, path, conflicts);
  }
  conflicts.push({ path, kind: 'both_changed' });
  return local;
}

function mergeObjectFields<T extends KeyedRecord>(base: T, local: T, remote: T, path: string, conflicts: CloudMergeConflict[]): T {
  const keys = new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)]);
  const merged: KeyedRecord = {};
  for (const key of keys) {
    const value = mergeValue(base[key], local[key], remote[key], `${path}.${key}`, conflicts);
    if (value !== undefined) {
      merged[key] = value;
    }
  }
  return merged as T;
}

function isRecord(value: unknown): value is KeyedRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function same(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}
