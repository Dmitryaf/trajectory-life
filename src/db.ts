import Dexie, { type EntityTable } from 'dexie';
import type { AppSettings, DailyEntry, DailyEntryDraft, LifeEventRecord, MonthlyReview, ResultRecord, WeeklyReview } from './types';
import { INDEXED_DB_VERSION } from './model/dataVersions';
import type { EditorDraft } from './model/editorDraft';
import type { SelfReminder } from './model/selfReminder';

export type CloudSyncBase = {
  userId: string;
  revision: number;
  snapshot: unknown;
};

class TrajectoryDatabase extends Dexie {
  dailyEntries!: EntityTable<DailyEntry, 'date'>;
  dailyEntryDrafts!: EntityTable<DailyEntryDraft, 'date'>;
  editorDrafts!: EntityTable<EditorDraft, 'key'>;
  results!: EntityTable<ResultRecord, 'id'>;
  lifeEvents!: EntityTable<LifeEventRecord, 'id'>;
  selfReminders!: EntityTable<SelfReminder, 'id'>;
  weeklyReviews!: EntityTable<WeeklyReview, 'weekStart'>;
  monthlyReviews!: EntityTable<MonthlyReview, 'monthStart'>;
  settings!: EntityTable<AppSettings, 'id'>;
  cloudSyncBases!: EntityTable<CloudSyncBase, 'userId'>;

  constructor() {
    super('trajectory');
    this.version(1).stores({
      dailyEntries: '&date, updatedAt, careerState',
      results: '++id, date, area, createdAt',
      weeklyReviews: '&weekStart',
      settings: '&id',
    });
    this.version(2).stores({
      dailyEntries: '&date, updatedAt, careerState',
      results: '++id, date, area, createdAt',
      lifeEvents: '++id, date, type, createdAt',
      weeklyReviews: '&weekStart',
      settings: '&id',
    });
    this.version(3).stores({
      dailyEntries: '&date, updatedAt, careerState',
      results: '++id, date, area, createdAt',
      lifeEvents: '++id, date, type, createdAt',
      weeklyReviews: '&weekStart',
      monthlyReviews: '&monthStart',
      settings: '&id',
    });
    this.version(5).stores({
      dailyEntries: '&date, updatedAt, careerState',
      dailyEntryDrafts: '&date, updatedAt',
      results: '++id, date, area, createdAt',
      lifeEvents: '++id, date, type, createdAt',
      weeklyReviews: '&weekStart',
      monthlyReviews: '&monthStart',
      settings: '&id',
      cloudSyncBases: '&userId',
    });
    this.version(6).stores({ editorDrafts: '&key, updatedAt' });
    this.version(INDEXED_DB_VERSION).stores({ selfReminders: '&id' });
  }
}

export const db = new TrajectoryDatabase();
