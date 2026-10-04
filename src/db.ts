import Dexie, { type EntityTable } from 'dexie';
import type { AppSettings, DailyEntry, DailyEntryDraft, LifeEventRecord, MonthlyReview, ResultRecord, WeeklyReview } from './types';
import { INDEXED_DB_VERSION } from './model/dataVersions';

export type CloudSyncBase = {
  userId: string;
  revision: number;
  snapshot: unknown;
};

class TrajectoryDatabase extends Dexie {
  dailyEntries!: EntityTable<DailyEntry, 'date'>;
  dailyEntryDrafts!: EntityTable<DailyEntryDraft, 'date'>;
  results!: EntityTable<ResultRecord, 'id'>;
  lifeEvents!: EntityTable<LifeEventRecord, 'id'>;
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
    this.version(INDEXED_DB_VERSION).stores({
      dailyEntries: '&date, updatedAt, careerState',
      dailyEntryDrafts: '&date, updatedAt',
      results: '++id, date, area, createdAt',
      lifeEvents: '++id, date, type, createdAt',
      weeklyReviews: '&weekStart',
      monthlyReviews: '&monthStart',
      settings: '&id',
      cloudSyncBases: '&userId',
    });
  }
}

export const db = new TrajectoryDatabase();
