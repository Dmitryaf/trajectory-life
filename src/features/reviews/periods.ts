import { addDays, endOfMonth, endOfWeek } from '@/services/dates';

export type ReviewPeriod = 'week' | 'month';

export function reviewOpensOn(period: ReviewPeriod, anchor: string) {
  return period === 'week' ? addDays(endOfWeek(anchor), -1) : addDays(endOfMonth(anchor), -2);
}

export function reviewPath(period: ReviewPeriod, anchor: string, openForm = false) {
  return `/${period}?${period}=${anchor}${openForm ? `#${period}-review` : ''}`;
}
