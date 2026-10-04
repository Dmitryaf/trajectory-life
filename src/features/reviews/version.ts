import type { MonthlyReview, WeeklyReview } from '@/types';

export class ReviewChangedError extends Error {
  constructor() {
    super('Обзор изменился на другом устройстве. Выберите версию перед сохранением.');
    this.name = 'ReviewChangedError';
  }
}

export function assertReviewVersion<T extends WeeklyReview | MonthlyReview>(current: T | undefined, expected: T | null | undefined) {
  if (expected !== undefined && JSON.stringify(current ?? null) !== JSON.stringify(expected)) {
    throw new ReviewChangedError();
  }
}
