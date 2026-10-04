// @vitest-environment happy-dom

import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { buildDecisionFollowUp } from '../decisionFollowUp';
import DecisionFollowUp from '../ui/DecisionFollowUp.vue';
import { emptyDailyEntry, emptyWeeklyReview } from '@/types';

describe('decision follow-up', () => {
  it('links only sequential reviewed weeks with an explicit user check', () => {
    const previous = {
      ...emptyWeeklyReview('2026-08-03'),
      nextLever: 'Начинать важное действие утром',
      ifThenPlan: 'Если откладываю, то делаю один шаг',
    };
    const current = {
      ...emptyWeeklyReview('2026-08-10'),
      previousPlanOutcome: 'Три раза получилось начать до обеда, в остальные дни данных мало.',
      nextLever: 'Оставить короткий утренний старт',
      stateContext: 'Два дня были перегружены.',
    };

    const followUp = buildDecisionFollowUp(
      previous,
      current,
      [{ ...emptyDailyEntry('2026-08-12'), importantFact: 'Получил ответ на письмо' }],
      [{ id: 1, date: '2026-08-11', area: 'career', title: 'Отправил черновик', note: '', createdAt: '2026-08-11T10:00:00Z' }],
      [{ id: 2, date: '2026-08-13', type: 'event', title: 'Изменился срок', note: '', createdAt: '2026-08-13T10:00:00Z' }],
    );

    expect(followUp?.facts).toHaveLength(3);
    expect(followUp?.facts.map((fact) => fact.label)).toEqual(['Итог', 'Событие', 'Условия недели']);
    expect(followUp?.userOutcome).toContain('Три раза получилось');
    expect(followUp?.nextDecision).toBe('Оставить короткий утренний старт');
  });

  it('does not infer a cycle from missing checks or non-sequential weeks', () => {
    const previous = { ...emptyWeeklyReview('2026-08-03'), nextLever: 'Проверить решение' };
    expect(buildDecisionFollowUp(previous, emptyWeeklyReview('2026-08-10'), [], [], [])).toBeNull();
    expect(
      buildDecisionFollowUp(previous, { ...emptyWeeklyReview('2026-08-17'), previousPlanOutcome: 'Получилось' }, [], [], []),
    ).toBeNull();
  });

  it('keeps the user check separate from recorded facts and names missing next decisions', () => {
    const followUp = buildDecisionFollowUp(
      { ...emptyWeeklyReview('2026-08-03'), nextLever: 'Начинать раньше' },
      { ...emptyWeeklyReview('2026-08-10'), previousPlanOutcome: 'Данных хватило только за два дня.' },
      [],
      [],
      [],
    )!;
    const wrapper = mount(DecisionFollowUp, { props: { followUp } });

    expect(wrapper.get('.decision-follow-up__step--outcome').text()).toContain('Данных хватило только за два дня.');
    expect(wrapper.text()).toContain('Отдельных итогов, событий или важных условий за неделю не сохранено.');
    expect(wrapper.text()).toContain('Они сами по себе не доказывают причину.');
    expect(wrapper.text()).toContain('Следующее решение пока не сохранено.');
  });
});
