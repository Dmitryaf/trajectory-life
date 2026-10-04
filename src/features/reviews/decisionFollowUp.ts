import { addDays } from '@/services/dates';
import type { DailyEntry, LifeEventRecord, ResultRecord, WeeklyReview } from '@/types';

export type DecisionFollowUpFact = {
  id: string;
  date: string;
  label: string;
  text: string;
};

export type DecisionFollowUp = {
  previousWeekStart: string;
  currentWeekStart: string;
  decision: string;
  ifThenPlan: string;
  facts: DecisionFollowUpFact[];
  userOutcome: string;
  nextDecision: string;
  nextIfThenPlan: string;
};

export function buildDecisionFollowUp(
  previousReview: WeeklyReview | undefined,
  currentReview: WeeklyReview | undefined,
  entries: DailyEntry[],
  results: ResultRecord[],
  lifeEvents: LifeEventRecord[],
): DecisionFollowUp | null {
  if (!previousReview || !currentReview) {
    return null;
  }
  if (currentReview.weekStart !== addDays(previousReview.weekStart, 7)) {
    return null;
  }

  const decision = previousReview.nextLever.trim();
  const ifThenPlan = previousReview.ifThenPlan.trim();
  const userOutcome = currentReview.previousPlanOutcome.trim();
  if ((!decision && !ifThenPlan) || !userOutcome) {
    return null;
  }

  const start = currentReview.weekStart;
  const end = addDays(start, 6);
  const facts: DecisionFollowUpFact[] = [];
  const addFact = (fact: DecisionFollowUpFact) => {
    if (facts.length < 3 && !facts.some((item) => item.label === fact.label && item.text === fact.text)) {
      facts.push(fact);
    }
  };

  results
    .filter((result) => result.date >= start && result.date <= end && result.title.trim())
    .sort((a, b) => a.date.localeCompare(b.date))
    .forEach((result) =>
      addFact({ id: `result-${result.id ?? result.createdAt}`, date: result.date, label: 'Итог', text: result.title.trim() }),
    );
  lifeEvents
    .filter((event) => event.date >= start && event.date <= end && event.title.trim())
    .sort((a, b) => a.date.localeCompare(b.date))
    .forEach((event) =>
      addFact({ id: `event-${event.id ?? event.createdAt}`, date: event.date, label: 'Событие', text: event.title.trim() }),
    );

  currentReview.results
    .filter((value) => value.trim())
    .forEach((value, index) => addFact({ id: `review-result-${index}`, date: end, label: 'Итог обзора', text: value.trim() }));
  currentReview.highlights
    .filter((value) => value.trim())
    .forEach((value, index) => addFact({ id: `review-highlight-${index}`, date: end, label: 'Важная запись', text: value.trim() }));
  if (currentReview.stateContext.trim()) {
    addFact({ id: 'review-context', date: end, label: 'Условия недели', text: currentReview.stateContext.trim() });
  }
  entries
    .filter((entry) => entry.date >= start && entry.date <= end && entry.importantFact.trim())
    .sort((a, b) => a.date.localeCompare(b.date))
    .forEach((entry) => addFact({ id: `entry-${entry.date}`, date: entry.date, label: 'Запись дня', text: entry.importantFact.trim() }));

  return {
    previousWeekStart: previousReview.weekStart,
    currentWeekStart: currentReview.weekStart,
    decision,
    ifThenPlan,
    facts,
    userOutcome,
    nextDecision: currentReview.nextLever.trim(),
    nextIfThenPlan: currentReview.ifThenPlan.trim(),
  };
}
