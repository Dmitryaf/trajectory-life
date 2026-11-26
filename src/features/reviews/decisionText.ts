import type { WeeklyReview } from '@/types';

export function weeklyDecisionText(review?: Pick<WeeklyReview, 'nextLever'>): string {
  const decision = review?.nextLever.trim() ?? '';
  return decision === 'Пока без решения' ? '' : decision;
}
