import { describe, expect, it } from 'vitest';
import { emptyDailyEntry, emptyMonthlyReview, emptyWeeklyReview } from '@/types';
import { readViewedReviews, reviewReminders, reviewReminderStorageKey, writeViewedReviews } from '../reminders';

const data = (): Parameters<typeof reviewReminders>[0] => ({
  dailyEntries: [],
  results: [],
  lifeEvents: [],
  weeklyReviews: [],
  monthlyReviews: [],
});

describe('optional review reminders', () => {
  it.each(['results', 'lifeEvents'] as const)('uses %s without daily measurements and excludes future and older records', (collection) => {
    const diary = data();
    const record = { date: '2026-10-17', title: 'Важная запись', note: '', createdAt: '' };
    if (collection === 'results') {
      diary.results = [{ ...record, area: 'career' }];
    } else {
      diary.lifeEvents = [{ ...record, type: 'insight' }];
    }
    expect(reviewReminders(diary, '2026-10-17', {}).map((item) => item.period)).toEqual(['week']);
    expect(reviewReminders(diary, '2026-10-16', {})).toEqual([]);
    diary[collection][0]!.date = '2026-10-18';
    expect(reviewReminders(diary, '2026-10-17', {})).toEqual([]);
    diary[collection][0]!.date = '2026-10-11';
    expect(reviewReminders(diary, '2026-10-17', {})).toEqual([]);
  });

  it('keeps week and month independent and expires old invitations without accumulating debt', () => {
    const diary = data();
    diary.dailyEntries = [{ ...emptyDailyEntry('2026-10-31'), importantFact: 'Обычный день' }];
    expect(reviewReminders(diary, '2026-10-31', {}).map((item) => item.period)).toEqual(['week', 'month']);
    expect(reviewReminders(diary, '2026-10-31', { week: '2026-10-26' }).map((item) => item.period)).toEqual(['month']);
    expect(reviewReminders(diary, '2026-10-31', { week: '2026-10-19' })).toHaveLength(2);
    expect(reviewReminders(diary, '2026-11-02', {})).toEqual([]);
    diary.weeklyReviews = [emptyWeeklyReview('2026-10-26')];
    expect(reviewReminders(diary, '2026-10-31', {}).map((item) => item.period)).toEqual(['month']);
    diary.monthlyReviews = [emptyMonthlyReview('2026-10-01')];
    expect(reviewReminders(diary, '2026-10-31', {})).toEqual([]);
  });

  it('opens the monthly window only for its last three days, including a short month', () => {
    const diary = data();
    diary.dailyEntries = [{ ...emptyDailyEntry('2027-02-22'), importantFact: 'Заметка' }];
    expect(reviewReminders(diary, '2027-02-25', {})).toEqual([]);
    expect(reviewReminders(diary, '2027-02-26', {}).map((item) => item.period)).toEqual(['month']);
  });

  it('round-trips only period keys for their owner and tolerates unavailable or malformed storage', () => {
    const memory = new Map<string, string>();
    const storage = {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => {
        memory.set(key, value);
      },
    };
    writeViewedReviews('alice', { week: '2026-10-12', month: '2026-10-01' }, storage);
    expect(readViewedReviews('alice', storage)).toEqual({ week: '2026-10-12', month: '2026-10-01' });
    expect(readViewedReviews('bob', storage)).toEqual({});
    memory.set(reviewReminderStorageKey, '{broken');
    expect(readViewedReviews('alice', storage)).toEqual({});
    const unavailable = {
      getItem: () => {
        throw new Error('unavailable');
      },
      setItem: () => {
        throw new Error('full');
      },
    };
    expect(readViewedReviews('alice', unavailable)).toEqual({});
    expect(() => writeViewedReviews('alice', { week: '2026-10-12' }, unavailable)).not.toThrow();
  });
});
