import { defineStore } from 'pinia';
import { db } from '../db';
import {
  CloudRevisionConflictError,
  getCloudSyncMeta,
  isCloudSyncConfigured,
  loadCloudSnapshot,
  markCloudSyncConflict,
  markCloudSyncPending,
  markCloudSyncSynced,
  saveCloudSnapshot,
  type CloudSnapshot,
} from '../services/cloudSync';
import { plainCopy } from '../services/plain';
import { CloudOperationCancelledError, type CloudOperationScope } from '../services/cloudOperation';
import { useAuthStore } from './auth';
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
  type DailyEntryDraft,
  type LifeEventRecord,
  type MonthlyReview,
  type ResultRecord,
  type WeeklyReview,
} from '../types';
import { normalizeSnapshot, type ExportPayload } from '../features/backup/snapshot';
import { BACKUP_VERSION } from '../features/backup/version';
import { clearFirstUseFunnel } from '../features/first-use/funnel';
import { experimentEntryLinkError, experimentIntegrityError, linkLegacyExperimentEntries } from '../features/experiments/model';
import { validDate } from '../model/normalization';
import { startOfMonth, startOfWeek } from '../services/dates';
import { loadCloudSyncBase, saveCloudSyncBase } from '../features/sync/base';
import { CloudMergeConflictError, mergeCloudSnapshots } from '../features/sync/merge';
import { serializeLocalData } from '../features/sync/localData';
import { announceCloudSnapshotApplied } from '../features/sync/events';
import { assertReviewVersion } from '../features/reviews/version';
import {
  checkStoragePersistence,
  requestStoragePersistence,
  runStorageWrite,
  type StoragePersistenceStatus,
} from '../services/storageProtection';

export type { ExportPayload } from '../features/backup/snapshot';

type CloudSyncStatus = 'disabled' | 'idle' | 'syncing' | 'synced' | 'pending' | 'conflict' | 'error';

export type CloudSyncResult =
  | { status: 'synced'; updatedAt: string }
  | { status: 'pending'; error: string }
  | { status: 'disabled' | 'conflict' | 'queued' | 'cancelled' };

class CloudDataConflictError extends Error {
  constructor(public readonly remote: CloudSnapshot) {
    super('Локальная и облачная версии содержат несовместимые изменения');
    this.name = 'CloudDataConflictError';
  }
}

async function saveSnapshotWithConflictResolution(
  scope: CloudOperationScope,
  initialPayload: ExportPayload,
  importMerged: (base: ExportPayload, remote: CloudSnapshot) => Promise<ExportPayload>,
  saveBase: (snapshot: CloudSnapshot, revision: number) => Promise<void>,
): Promise<CloudSnapshot> {
  const { userId, assertCurrent } = scope;
  let payload = initialPayload;
  let expectedRevision = userId ? getCloudSyncMeta(userId).lastCloudRevision : 0;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      assertCurrent();
      const saved = await saveCloudSnapshot(payload, expectedRevision, scope);
      assertCurrent();
      await saveBase(saved, saved.revision ?? expectedRevision + 1);
      assertCurrent();
      return saved;
    } catch (error) {
      assertCurrent();
      const canResolveConflict = error instanceof CloudRevisionConflictError && userId && attempt < 2;
      if (!canResolveConflict) {
        throw error;
      }
      const remote = await loadCloudSnapshot(scope);
      assertCurrent();
      if (!remote) {
        expectedRevision = 0;
        continue;
      }
      const base = await loadCloudSyncBase(userId);
      assertCurrent();
      if (!base) {
        throw new CloudDataConflictError(remote);
      }
      try {
        payload = await importMerged(base.snapshot, remote);
      } catch (mergeError) {
        if (mergeError instanceof CloudMergeConflictError) {
          throw new CloudDataConflictError(remote);
        }
        throw mergeError;
      }
      assertCurrent();
      expectedRevision = remote.revision ?? 1;
    }
  }
  throw new Error('Не удалось сохранить облачную копию после повторных попыток');
}

export const useAppStore = defineStore('app', {
  state: () => ({
    loaded: false,
    loadError: '',
    cloudSyncStatus: (isCloudSyncConfigured() ? 'idle' : 'disabled') as CloudSyncStatus,
    cloudSyncMessage: '',
    cloudSyncUpdatedAt: '',
    cloudSyncError: '',
    cloudSyncQueued: false,
    localDataGeneration: 0,
    cloudConflictSnapshot: null as CloudSnapshot | null,
    storagePersistenceStatus: 'unknown' as StoragePersistenceStatus,
    storagePersistenceRequested: false,
    storagePersistenceRevision: 0,
    dailyEntries: [] as DailyEntry[],
    dailyEntryDrafts: [] as DailyEntryDraft[],
    results: [] as ResultRecord[],
    lifeEvents: [] as LifeEventRecord[],
    weeklyReviews: [] as WeeklyReview[],
    monthlyReviews: [] as MonthlyReview[],
    settings: structuredClone(defaultSettings) as AppSettings,
  }),
  getters: {
    entryByDate: (state) => (date: string) => state.dailyEntries.find((entry) => entry.date === date),
    draftByDate: (state) => (date: string) => state.dailyEntryDrafts.find((draft) => draft.date === date),
    reviewByWeek: (state) => (weekStart: string) => state.weeklyReviews.find((review) => review.weekStart === weekStart),
    reviewByMonth: (state) => (monthStart: string) => state.monthlyReviews.find((review) => review.monthStart === monthStart),
  },
  actions: {
    createCloudOperationScope(): CloudOperationScope {
      const userId = useAuthStore().session?.user.id;
      const generation = this.localDataGeneration;
      return {
        userId,
        assertCurrent: () => {
          if (generation !== this.localDataGeneration || userId !== useAuthStore().session?.user.id) {
            throw new CloudOperationCancelledError();
          }
        },
      };
    },
    async load(): Promise<void> {
      const scope = this.createCloudOperationScope();
      return serializeLocalData(this, scope.assertCurrent, () => this.loadLocalData(scope));
    },
    async loadLocalData(scope: CloudOperationScope) {
      this.loadError = '';
      try {
        const [dailyEntries, dailyEntryDrafts, results, lifeEvents, weeklyReviews, monthlyReviews, settings] = await Promise.all([
          db.dailyEntries.toArray(),
          db.dailyEntryDrafts.toArray(),
          db.results.toArray(),
          db.lifeEvents.toArray(),
          db.weeklyReviews.toArray(),
          db.monthlyReviews.toArray(),
          db.settings.get('main'),
        ]);
        scope.assertCurrent();
        const activeSettings = normalizeSettings(settings);
        const normalizedEntries = dailyEntries.map((entry) => normalizeDailyEntry(entry));
        const linkedEntries = linkLegacyExperimentEntries(normalizedEntries, activeSettings);
        const normalizedDrafts = dailyEntryDrafts.map((draft) => ({
          ...draft,
          entry: normalizeDailyEntry(draft.entry),
        }));
        const linkedDrafts = normalizedDrafts.map((draft) => {
          const linkedEntry = linkLegacyExperimentEntries([draft.entry], activeSettings)[0]!;
          return {
            ...draft,
            entry: experimentEntryLinkError([linkedEntry], activeSettings) ? { ...linkedEntry, experimentId: null } : linkedEntry,
          };
        });
        this.dailyEntries = linkedEntries;
        this.dailyEntryDrafts = linkedDrafts;
        this.results = results.map((result) => normalizeResult(result)).sort((a, b) => b.date.localeCompare(a.date));
        this.lifeEvents = lifeEvents.map((event) => normalizeLifeEvent(event)).sort((a, b) => b.date.localeCompare(a.date));
        this.weeklyReviews = weeklyReviews.map((review) => normalizeWeeklyReview(review));
        this.monthlyReviews = monthlyReviews.map((review) => normalizeMonthlyReview(review));
        this.settings = activeSettings;
        await runStorageWrite(() =>
          db.transaction('rw', [db.dailyEntries, db.dailyEntryDrafts, db.settings], async () => {
            await Promise.all([
              linkedEntries.length ? db.dailyEntries.bulkPut(plainCopy(linkedEntries)) : Promise.resolve(),
              linkedDrafts.length ? db.dailyEntryDrafts.bulkPut(plainCopy(linkedDrafts)) : Promise.resolve(),
              db.settings.put(plainCopy(activeSettings)),
            ]);
          }),
        );
        scope.assertCurrent();
        void this.checkLocalStoragePersistence();
      } catch (error) {
        scope.assertCurrent();
        this.loadError = error instanceof Error ? error.message : 'Не удалось открыть локальное хранилище';
        throw error;
      } finally {
        scope.assertCurrent();
        this.loaded = true;
      }
    },
    async saveEntry(entry: DailyEntry): Promise<DailyEntry> {
      const scope = this.createCloudOperationScope();
      return serializeLocalData(this, scope.assertCurrent, async () => {
        if (!validDate(entry.date)) {
          throw new Error('Укажите корректную дату записи');
        }
        const saved = plainCopy(normalizeDailyEntry({ ...entry, updatedAt: new Date().toISOString() }));
        const entryLinkError = experimentEntryLinkError([saved], this.settings);
        if (entryLinkError) {
          throw new Error(entryLinkError);
        }
        await runStorageWrite(() =>
          db.transaction('rw', [db.dailyEntries, db.dailyEntryDrafts], async () => {
            await db.dailyEntries.put(saved);
            await db.dailyEntryDrafts.delete(saved.date);
          }),
        );
        scope.assertCurrent();
        const index = this.dailyEntries.findIndex((item) => item.date === saved.date);
        if (index >= 0) {
          this.dailyEntries[index] = saved;
        } else {
          this.dailyEntries.push(saved);
        }
        scope.assertCurrent();
        this.dailyEntryDrafts = this.dailyEntryDrafts.filter((draft) => draft.date !== saved.date);
        void this.requestLocalStoragePersistence();
        void this.syncCloudSnapshot();
        return saved;
      });
    },
    async saveDailyEntryDraft(entry: DailyEntry): Promise<DailyEntryDraft> {
      const scope = this.createCloudOperationScope();
      return serializeLocalData(this, scope.assertCurrent, async () => {
        if (!validDate(entry.date)) {
          throw new Error('Укажите корректную дату черновика');
        }
        const normalizedEntry = plainCopy(normalizeDailyEntry(entry));
        const entryLinkError = experimentEntryLinkError([normalizedEntry], this.settings);
        if (entryLinkError) {
          throw new Error(entryLinkError);
        }
        const draft: DailyEntryDraft = {
          date: normalizedEntry.date,
          entry: normalizedEntry,
          updatedAt: new Date().toISOString(),
        };
        await runStorageWrite(() => db.dailyEntryDrafts.put(draft));
        scope.assertCurrent();
        const index = this.dailyEntryDrafts.findIndex((item) => item.date === draft.date);
        if (index >= 0) {
          this.dailyEntryDrafts[index] = draft;
        } else {
          this.dailyEntryDrafts.push(draft);
        }
        return draft;
      });
    },
    async removeDailyEntryDraft(date: string): Promise<void> {
      const scope = this.createCloudOperationScope();
      return serializeLocalData(this, scope.assertCurrent, async () => {
        await runStorageWrite(() => db.dailyEntryDrafts.delete(date));
        scope.assertCurrent();
        this.dailyEntryDrafts = this.dailyEntryDrafts.filter((draft) => draft.date !== date);
      });
    },
    async addResult(result: Omit<ResultRecord, 'id' | 'createdAt'>): Promise<void> {
      const scope = this.createCloudOperationScope();
      return serializeLocalData(this, scope.assertCurrent, async () => {
        if (!validDate(result.date)) {
          throw new Error('Укажите корректную дату итога');
        }
        const record: ResultRecord = plainCopy(
          normalizeResult({
            ...result,
            createdAt: new Date().toISOString(),
          }),
        );
        const id = await runStorageWrite(() => db.results.add(record));
        this.results.unshift({ ...record, id });
        void this.requestLocalStoragePersistence();
        void this.syncCloudSnapshot();
      });
    },
    async updateResult(result: ResultRecord): Promise<void> {
      const scope = this.createCloudOperationScope();
      return serializeLocalData(this, scope.assertCurrent, async () => {
        if (result.id === undefined) {
          return;
        }
        if (!validDate(result.date)) {
          throw new Error('Укажите корректную дату итога');
        }
        const record = plainCopy(normalizeResult(result));
        await runStorageWrite(() => db.results.put(record));
        scope.assertCurrent();
        const index = this.results.findIndex((item) => item.id === record.id);
        if (index >= 0) {
          this.results[index] = record;
        }
        this.results.sort((a, b) => b.date.localeCompare(a.date));
        void this.requestLocalStoragePersistence();
        void this.syncCloudSnapshot();
      });
    },
    async removeResult(id: number): Promise<void> {
      const scope = this.createCloudOperationScope();
      return serializeLocalData(this, scope.assertCurrent, async () => {
        await runStorageWrite(() => db.results.delete(id));
        scope.assertCurrent();
        this.results = this.results.filter((result) => result.id !== id);
        void this.requestLocalStoragePersistence();
        void this.syncCloudSnapshot();
      });
    },
    async addLifeEvent(event: Omit<LifeEventRecord, 'id' | 'createdAt'>): Promise<void> {
      const scope = this.createCloudOperationScope();
      return serializeLocalData(this, scope.assertCurrent, async () => {
        if (!validDate(event.date)) {
          throw new Error('Укажите корректную дату события');
        }
        const record: LifeEventRecord = plainCopy(
          normalizeLifeEvent({
            ...event,
            createdAt: new Date().toISOString(),
          }),
        );
        const id = await runStorageWrite(() => db.lifeEvents.add(record));
        this.lifeEvents.unshift({ ...record, id });
        this.lifeEvents.sort((a, b) => b.date.localeCompare(a.date));
        void this.requestLocalStoragePersistence();
        void this.syncCloudSnapshot();
      });
    },
    async updateLifeEvent(event: LifeEventRecord): Promise<void> {
      const scope = this.createCloudOperationScope();
      return serializeLocalData(this, scope.assertCurrent, async () => {
        if (event.id === undefined) {
          return;
        }
        if (!validDate(event.date)) {
          throw new Error('Укажите корректную дату события');
        }
        const record = plainCopy(normalizeLifeEvent(event));
        await runStorageWrite(() => db.lifeEvents.put(record));
        scope.assertCurrent();
        const index = this.lifeEvents.findIndex((item) => item.id === record.id);
        if (index >= 0) {
          this.lifeEvents[index] = record;
        }
        this.lifeEvents.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
        void this.requestLocalStoragePersistence();
        void this.syncCloudSnapshot();
      });
    },
    async removeLifeEvent(id: number): Promise<void> {
      const scope = this.createCloudOperationScope();
      return serializeLocalData(this, scope.assertCurrent, async () => {
        await runStorageWrite(() => db.lifeEvents.delete(id));
        scope.assertCurrent();
        this.lifeEvents = this.lifeEvents.filter((event) => event.id !== id);
        void this.requestLocalStoragePersistence();
        void this.syncCloudSnapshot();
      });
    },
    async saveReview(review: WeeklyReview, expected?: WeeklyReview | null): Promise<void> {
      const scope = this.createCloudOperationScope();
      return serializeLocalData(this, scope.assertCurrent, async () => {
        assertReviewVersion(this.reviewByWeek(review.weekStart), expected);
        if (!validDate(review.weekStart) || startOfWeek(review.weekStart) !== review.weekStart) {
          throw new Error('Начало недельного обзора должно быть понедельником');
        }
        const plainReview = plainCopy(
          normalizeWeeklyReview({
            ...review,
            updatedAt: new Date().toISOString(),
          }),
        );
        await runStorageWrite(() => db.weeklyReviews.put(plainReview));
        scope.assertCurrent();
        const index = this.weeklyReviews.findIndex((item) => item.weekStart === review.weekStart);
        if (index >= 0) {
          this.weeklyReviews[index] = plainReview;
        } else {
          this.weeklyReviews.push(plainReview);
        }
        void this.requestLocalStoragePersistence();
        void this.syncCloudSnapshot();
      });
    },
    async saveMonthlyReview(review: MonthlyReview, expected?: MonthlyReview | null): Promise<void> {
      const scope = this.createCloudOperationScope();
      return serializeLocalData(this, scope.assertCurrent, async () => {
        assertReviewVersion(this.reviewByMonth(review.monthStart), expected);
        if (!validDate(review.monthStart) || startOfMonth(review.monthStart) !== review.monthStart) {
          throw new Error('Начало месячного обзора должно быть первым днём месяца');
        }
        const plainReview = plainCopy(
          normalizeMonthlyReview({
            ...review,
            updatedAt: new Date().toISOString(),
          }),
        );
        await runStorageWrite(() => db.monthlyReviews.put(plainReview));
        scope.assertCurrent();
        const index = this.monthlyReviews.findIndex((item) => item.monthStart === review.monthStart);
        if (index >= 0) {
          this.monthlyReviews[index] = plainReview;
        } else {
          this.monthlyReviews.push(plainReview);
        }
        void this.requestLocalStoragePersistence();
        void this.syncCloudSnapshot();
      });
    },
    async saveSettings(settings: AppSettings): Promise<void> {
      const scope = this.createCloudOperationScope();
      return serializeLocalData(this, scope.assertCurrent, async () => {
        const integrityError = experimentIntegrityError(settings);
        if (integrityError) {
          throw new Error(integrityError);
        }
        const normalized = plainCopy(normalizeSettings(settings));
        const entryLinkError = experimentEntryLinkError(this.dailyEntries, normalized);
        if (entryLinkError) {
          throw new Error(entryLinkError);
        }
        await runStorageWrite(() => db.settings.put(normalized));
        scope.assertCurrent();
        this.settings = normalized;
        void this.requestLocalStoragePersistence();
        void this.syncCloudSnapshot();
      });
    },
    exportData(): ExportPayload {
      return plainCopy({
        version: BACKUP_VERSION,
        exportedAt: new Date().toISOString(),
        dailyEntries: this.dailyEntries,
        results: this.results,
        lifeEvents: this.lifeEvents,
        weeklyReviews: this.weeklyReviews,
        monthlyReviews: this.monthlyReviews,
        settings: this.settings,
      });
    },
    async importData(
      payload: unknown,
      options: { syncCloud?: boolean; preserveDailyDrafts?: boolean; scope?: CloudOperationScope } = {},
    ): Promise<void> {
      const scope = options.scope ?? this.createCloudOperationScope();
      return serializeLocalData(this, scope.assertCurrent, () => this.importLocalData(payload, options, scope));
    },
    async mergeCloudSnapshot(base: ExportPayload, remote: CloudSnapshot, scope: CloudOperationScope): Promise<ExportPayload> {
      return serializeLocalData(this, scope.assertCurrent, async () => {
        const payload = mergeCloudSnapshots(base, this.exportData(), remote.payload);
        await this.importLocalData(payload, { syncCloud: false, preserveDailyDrafts: true }, scope);
        scope.assertCurrent();
        announceCloudSnapshotApplied();
        return plainCopy(this.exportData());
      });
    },
    async saveSyncBase(scope: CloudOperationScope, snapshot: CloudSnapshot, revision: number): Promise<void> {
      return serializeLocalData(this, scope.assertCurrent, async () => {
        if (scope.userId) {
          await saveCloudSyncBase(scope.userId, revision, snapshot.payload);
          scope.assertCurrent();
        }
      });
    },
    async importLocalData(payload: unknown, options: { syncCloud?: boolean; preserveDailyDrafts?: boolean }, scope: CloudOperationScope) {
      const prepared = normalizeSnapshot(payload);
      await runStorageWrite(() =>
        db.transaction(
          'rw',
          [db.dailyEntries, db.dailyEntryDrafts, db.results, db.lifeEvents, db.weeklyReviews, db.monthlyReviews, db.settings],
          async () => {
            await Promise.all([
              db.dailyEntries.clear(),
              options.preserveDailyDrafts ? Promise.resolve() : db.dailyEntryDrafts.clear(),
              db.results.clear(),
              db.lifeEvents.clear(),
              db.weeklyReviews.clear(),
              db.monthlyReviews.clear(),
              db.settings.clear(),
            ]);
            await db.dailyEntries.bulkPut(prepared.dailyEntries);
            await db.results.bulkPut(prepared.results);
            await db.lifeEvents.bulkPut(prepared.lifeEvents ?? []);
            await db.weeklyReviews.bulkPut(prepared.weeklyReviews);
            await db.monthlyReviews.bulkPut(prepared.monthlyReviews ?? []);
            await db.settings.put(plainCopy(prepared.settings));
            scope.assertCurrent();
          },
        ),
      );
      scope.assertCurrent();
      await this.loadLocalData(scope);
      void this.requestLocalStoragePersistence();
      if (options.syncCloud) {
        void this.syncCloudSnapshot({ force: true });
      }
    },
    async clearAll(options: { syncCloud?: boolean } = { syncCloud: true }): Promise<void> {
      const scope = this.createCloudOperationScope();
      return serializeLocalData(this, scope.assertCurrent, async () => {
        await runStorageWrite(() =>
          db.transaction(
            'rw',
            [
              db.dailyEntries,
              db.dailyEntryDrafts,
              db.results,
              db.lifeEvents,
              db.weeklyReviews,
              db.monthlyReviews,
              db.settings,
              db.cloudSyncBases,
            ],
            async () => {
              await Promise.all([
                db.dailyEntries.clear(),
                db.dailyEntryDrafts.clear(),
                db.results.clear(),
                db.lifeEvents.clear(),
                db.weeklyReviews.clear(),
                db.monthlyReviews.clear(),
                db.settings.clear(),
                options.syncCloud ? Promise.resolve() : db.cloudSyncBases.clear(),
              ]);
            },
          ),
        );
        scope.assertCurrent();
        this.dailyEntries = [];
        scope.assertCurrent();
        this.dailyEntryDrafts = [];
        scope.assertCurrent();
        this.results = [];
        scope.assertCurrent();
        this.lifeEvents = [];
        this.weeklyReviews = [];
        this.monthlyReviews = [];
        scope.assertCurrent();
        this.settings = structuredClone(defaultSettings);
        clearFirstUseFunnel();
        await runStorageWrite(() => db.settings.put(plainCopy(this.settings)));
        scope.assertCurrent();
        if (options.syncCloud) {
          void this.syncCloudSnapshot({ force: true });
        }
      });
    },
    setCloudSyncState(status: CloudSyncStatus, message = '', details: { updatedAt?: string; error?: string } = {}) {
      this.cloudSyncStatus = isCloudSyncConfigured() ? status : 'disabled';
      this.cloudSyncMessage = message;
      this.cloudSyncUpdatedAt = details.updatedAt ?? this.cloudSyncUpdatedAt;
      this.cloudSyncError = details.error ?? '';
    },
    holdCloudConflict(snapshot: CloudSnapshot) {
      this.cloudConflictSnapshot = plainCopy(snapshot);
      this.setCloudSyncState(
        'conflict',
        'Локальная и облачная версии изменены по-разному. Автоматическая запись остановлена; обе версии сохранены.',
      );
    },
    async resolveCloudConflict(choice: 'local' | 'cloud') {
      const scope = this.createCloudOperationScope();
      const { userId } = scope;
      const conflict = this.cloudConflictSnapshot;
      if (!userId || !conflict || conflict.userId !== userId) {
        throw new Error('Не удалось открыть обе версии данных');
      }

      this.setCloudSyncState('syncing', 'Применяю выбранную версию…');
      try {
        let updatedAt = conflict.updatedAt;
        if (choice === 'cloud') {
          await this.importData(conflict.payload, { syncCloud: false, preserveDailyDrafts: true, scope });
          await this.saveSyncBase(scope, conflict, conflict.revision ?? 1);
          scope.assertCurrent();
          markCloudSyncSynced(userId, conflict.updatedAt, conflict.revision ?? 1);
        } else {
          const saved = await saveCloudSnapshot(this.exportData(), conflict.revision ?? 1, scope);
          await this.saveSyncBase(scope, saved, saved.revision ?? (conflict.revision ?? 1) + 1);
          scope.assertCurrent();
          updatedAt = saved.updatedAt;
        }
        this.cloudConflictSnapshot = null;
        this.setCloudSyncState('synced', `Облако синхронизировано: ${new Date(updatedAt).toLocaleString('ru-RU')}`, { updatedAt });
        if (this.cloudSyncQueued) {
          return this.syncCloudSnapshot();
        }
        if (choice === 'cloud') {
          announceCloudSnapshotApplied();
        }
        return { status: 'synced', updatedAt } as CloudSyncResult;
      } catch (error) {
        if (error instanceof CloudOperationCancelledError) {
          return { status: 'cancelled' } as CloudSyncResult;
        }
        scope.assertCurrent();
        if (error instanceof CloudRevisionConflictError) {
          const latest = await loadCloudSnapshot(scope);
          scope.assertCurrent();
          if (latest) {
            markCloudSyncConflict(userId, latest.updatedAt, latest.revision ?? 1);
            this.holdCloudConflict(latest);
            return { status: 'conflict' } as CloudSyncResult;
          }
        }
        const message = error instanceof Error ? error.message : 'Не удалось применить выбранную версию';
        this.setCloudSyncState('conflict', 'Обе версии сохранены. Попробуйте выбрать вариант ещё раз после восстановления сети.', {
          error: message,
        });
        throw error;
      }
    },
    async checkLocalStoragePersistence() {
      const revision = ++this.storagePersistenceRevision;
      this.storagePersistenceStatus = 'checking';
      const status = await checkStoragePersistence();
      if (revision === this.storagePersistenceRevision) {
        this.storagePersistenceStatus = status;
      }
      return status;
    },
    async requestLocalStoragePersistence() {
      if (this.storagePersistenceRequested || this.storagePersistenceStatus === 'persisted') {
        return this.storagePersistenceStatus;
      }
      this.storagePersistenceRequested = true;
      const revision = ++this.storagePersistenceRevision;
      this.storagePersistenceStatus = 'checking';
      const status = await requestStoragePersistence();
      if (revision === this.storagePersistenceRevision) {
        this.storagePersistenceStatus = status;
      }
      return status;
    },
    async syncCloudSnapshot(options: { force?: boolean } = {}) {
      void options;
      if (!isCloudSyncConfigured()) {
        this.setCloudSyncState('disabled');
        return { status: 'disabled' } as CloudSyncResult;
      }

      const scope = this.createCloudOperationScope();
      const { userId } = scope;
      if (this.cloudSyncStatus === 'syncing') {
        this.cloudSyncQueued = true;
        return { status: 'queued' } as CloudSyncResult;
      }
      if (userId && (this.cloudConflictSnapshot || getCloudSyncMeta(userId).conflict)) {
        this.setCloudSyncState(
          'conflict',
          'Локальная и облачная версии изменены по-разному. Автоматическая запись остановлена до явного выбора.',
        );
        return { status: 'conflict' } as CloudSyncResult;
      }

      if (userId) {
        markCloudSyncPending(userId, 'Локальные изменения ожидают синхронизации');
      }
      this.setCloudSyncState('syncing', 'Сохраняю облачную копию…');
      let updatedAt: string;
      do {
        this.cloudSyncQueued = false;
        try {
          const saved = await saveSnapshotWithConflictResolution(
            scope,
            this.exportData(),
            (base, remote) => this.mergeCloudSnapshot(base, remote, scope),
            (snapshot, revision) => this.saveSyncBase(scope, snapshot, revision),
          );
          scope.assertCurrent();
          updatedAt = saved.updatedAt;
        } catch (error) {
          if (error instanceof CloudOperationCancelledError) {
            return { status: 'cancelled' } as CloudSyncResult;
          }
          scope.assertCurrent();
          if (error instanceof CloudDataConflictError && userId) {
            markCloudSyncConflict(userId, error.remote.updatedAt, error.remote.revision ?? 1);
            this.holdCloudConflict(error.remote);
            return { status: 'conflict' } as CloudSyncResult;
          }
          const message = error instanceof Error ? error.message : 'Не удалось сохранить облачную копию';
          if (userId) {
            markCloudSyncPending(userId, message);
          }
          this.setCloudSyncState('pending', 'Изменения сохранены локально. Облако обновится после повторной синхронизации.', {
            error: message,
          });
          return { status: 'pending', error: message } as CloudSyncResult;
        }
      } while (this.cloudSyncQueued);
      this.setCloudSyncState('synced', `Облако обновлено: ${new Date(updatedAt).toLocaleString('ru-RU')}`, { updatedAt });
      return { status: 'synced', updatedAt } as CloudSyncResult;
    },
    unload() {
      this.localDataGeneration += 1;
      this.loaded = false;
      this.loadError = '';
      this.cloudSyncStatus = isCloudSyncConfigured() ? 'idle' : 'disabled';
      this.cloudSyncMessage = '';
      this.cloudSyncUpdatedAt = '';
      this.cloudSyncError = '';
      this.cloudSyncQueued = false;
      this.cloudConflictSnapshot = null;
      this.storagePersistenceStatus = 'unknown';
      this.storagePersistenceRequested = false;
      this.storagePersistenceRevision = 0;
      this.dailyEntries = [];
      this.dailyEntryDrafts = [];
      this.results = [];
      this.lifeEvents = [];
      this.weeklyReviews = [];
      this.monthlyReviews = [];
      this.settings = structuredClone(defaultSettings);
    },
  },
});
