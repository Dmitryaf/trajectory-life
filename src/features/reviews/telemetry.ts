import type { MonthlyReview, WeeklyReview } from '@/types';
import { captureProductEvent } from '@/features/telemetry/productTelemetry';

export function hasMeaningfulReview(review: WeeklyReview | MonthlyReview): boolean {
  if ('weekStart' in review) {
    return [
      ...review.results,
      ...review.highlights,
      review.previousPlanOutcome,
      review.stateContext,
      review.support,
      review.obstacle,
      review.nextLever,
      review.ifThenPlan,
    ].some((value) => value.trim());
  }
  return [review.mainPattern, review.support, review.obstacle, review.courseChange, review.nextFocus, review.ifThenPlan].some((value) =>
    value.trim(),
  );
}
function decision(review: WeeklyReview | MonthlyReview | undefined): string {
  if (!review) {
    return '';
  }
  const value = 'weekStart' in review ? review.nextLever.trim() : review.courseChange.trim();
  return value === 'Пока без решения' ? '' : value;
}
export function captureDecisionSave(review: WeeklyReview | MonthlyReview, previous?: WeeklyReview | MonthlyReview): () => void {
  if (!decision(review) || decision(review) === decision(previous)) {
    return () => {};
  }
  return captureProductEvent('decision_saved', { period_type: 'weekStart' in review ? 'week' : 'month' });
}
export function captureReviewSave(review: WeeklyReview | MonthlyReview, previous?: WeeklyReview | MonthlyReview): () => void {
  if (!hasMeaningfulReview(review)) {
    return () => {};
  }
  const saved = captureProductEvent('weekStart' in review ? 'week_review_saved' : 'month_review_saved', {
    save_kind: previous ? 'updated' : 'created',
  });
  const decisionSaved = captureDecisionSave(review, previous);
  return () => {
    saved();
    decisionSaved();
  };
}
