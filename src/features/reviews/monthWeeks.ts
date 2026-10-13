import { addDays, dateRange, endOfMonth, startOfWeek } from '@/services/dates';
import type { DailyEntry, LifeEventRecord, ResultRecord, WeeklyReview } from '@/types';
import { summarize } from '@/features/analytics/periodSummary';

export function monthWeekSummariesForPeriod(
  entries: DailyEntry[],
  results: ResultRecord[],
  events: LifeEventRecord[],
  start: string,
  end: string,
  externalCareerIds: string[],
) {
  return [...new Set(dateRange(start, end).map((date) => startOfWeek(date)))]
    .map((weekStart) => {
      const rangeStart = weekStart < start ? start : weekStart;
      const naturalEnd = addDays(weekStart, 6);
      const rangeEnd = naturalEnd > end ? end : naturalEnd;
      const summary = summarize(
        entries.filter((entry) => entry.date >= rangeStart && entry.date <= rangeEnd),
        externalCareerIds,
      );
      return {
        rangeStart,
        rangeEnd,
        summary,
        resultsCount: results.filter((result) => result.date >= rangeStart && result.date <= rangeEnd).length,
        eventsCount: events.filter((event) => event.date >= rangeStart && event.date <= rangeEnd).length,
      };
    })
    .filter((week) => week.summary.coveredEntriesCount > 0);
}

export function monthWeekReviews(reviews: WeeklyReview[], start: string, end: string) {
  return reviews
    .filter((review) => {
      const coveredEnd = review.coveredThrough || addDays(review.weekStart, 6);
      return review.weekStart <= end && coveredEnd >= start;
    })
    .map((review) => {
      const fields = [
        { label: 'Ваше решение', text: review.nextLever },
        { label: 'Проверка прежнего решения', text: review.previousPlanOutcome },
        { label: 'Что помогало', text: review.support },
        { label: 'Что мешало', text: review.obstacle },
        { label: 'Обстоятельства недели', text: review.stateContext },
        { label: 'План на следующую неделю', text: review.ifThenPlan },
        ...review.highlights.map((text) => ({ label: 'Важное за неделю', text })),
        ...review.results.map((text) => ({ label: 'Итог', text })),
      ].filter((field) => field.text.trim());
      const weekEnd = addDays(review.weekStart, 6);
      return { review, fields, weekEnd, crossesMonth: review.weekStart < start || weekEnd > endOfMonth(start) };
    })
    .filter((week) => week.fields.length > 0)
    .sort((a, b) => a.review.weekStart.localeCompare(b.review.weekStart));
}
