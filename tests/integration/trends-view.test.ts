// @vitest-environment happy-dom

import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { emptyDailyEntry, type DailyEntry } from '@/types';
import TrendsView from '@/views/TrendsView.vue';
import { createStore, routerLinkStub } from '../helpers/viewScenario';

describe('trends scenarios', () => {
  function buildCoveredTrendEntries(): DailyEntry[] {
    const months = [
      '2025-08',
      '2025-09',
      '2025-10',
      '2025-11',
      '2025-12',
      '2026-01',
      '2026-02',
      '2026-03',
      '2026-04',
      '2026-05',
      '2026-06',
      '2026-07',
    ];

    return months.flatMap((month, monthIndex) =>
      Array.from(
        { length: 8 },
        (_, dayIndex) =>
          ({
            ...emptyDailyEntry(`${month}-${String(dayIndex + 1).padStart(2, '0')}`),
            recordedFields: ['sleepMinutes', 'energy', 'contextFactors', 'weightKg', 'actionDirection'],
            sleepMinutes: 405 + (monthIndex % 3) * 15,
            energy: 2 + (monthIndex % 3),
            contextFactors: dayIndex < 4 ? ['screen'] : [],
            contextFactorsRecorded: true,
            weightKg: 80 - monthIndex * 0.2,
            actionDirection: dayIndex % 3 === 0 ? 'preparation' : 'external',
            importantFact: `Наблюдение ${dayIndex + 1}`,
          }) satisfies DailyEntry,
      ),
    );
  }

  it('shows conclusions and the change history before one optional metric', async () => {
    const { pinia, store } = createStore();
    store.dailyEntries = buildCoveredTrendEntries();
    store.results = [
      {
        id: 1,
        date: '2026-07-08',
        area: 'career',
        title: 'Готовый результат',
        note: '',
        createdAt: '2026-07-08T12:00:00.000Z',
      },
    ];
    store.lifeEvents = [
      {
        id: 1,
        date: '2026-07-05',
        type: 'event',
        title: 'Важное событие',
        note: '',
        createdAt: '2026-07-05T12:00:00.000Z',
      },
    ];
    const wrapper = mount(TrendsView, { global: { plugins: [pinia], stubs: { EChartPanel: true, RouterLink: routerLinkStub } } });

    expect(wrapper.get('.range-custom-action strong').text()).toBe('Данные для анализа за другие даты');
    expect(wrapper.get('.range-custom-action a').text()).toBe('Перейти к экспорту');
    expect(wrapper.get('.range-custom-action a').attributes('href')).toBe('/settings#analysis-settings');
    expect(wrapper.get('h1').text()).toBe('История изменений');
    expect(wrapper.html().indexOf('dashboard-card--insights')).toBeLessThan(wrapper.html().indexOf('history-timeline--featured'));
    expect(wrapper.html().indexOf('history-timeline--featured')).toBeLessThan(wrapper.html().indexOf('trends-metric-details'));
    expect(wrapper.findAll('.review-cue-grid--primary .review-cue')).toHaveLength(3);
    expect(wrapper.get('.trends-metric-details').attributes('open')).toBeUndefined();
    expect(wrapper.get('.trends-event-details').attributes('open')).toBeUndefined();
    expect(wrapper.find('.trends-quality-details').exists()).toBe(false);
    expect(wrapper.find('.trends-table-details').exists()).toBe(false);
    expect(wrapper.find('.trends-action-details').exists()).toBe(false);
    expect(wrapper.find('.trends-factor-details').exists()).toBe(false);
    expect(wrapper.find('.trends-additional-details').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('Показать остальные наблюдения');
    expect(wrapper.findAll('.trend-chart-description')).toHaveLength(1);
    expect(wrapper.findAll('e-chart-panel-stub')).toHaveLength(1);
    const chartOption = wrapper.getComponent({ name: 'EChartPanel' }).props('option') as {
      series: Array<{ tooltip: { valueFormatter: (value: unknown) => string } }>;
    };
    expect(chartOption.series[0]!.tooltip.valueFormatter(undefined)).toBe('—');
    expect(chartOption.series[0]!.tooltip.valueFormatter(7.5)).toBe('7,5 ч');

    for (const label of ['3 месяца', '6 месяцев', '12 месяцев'] as const) {
      const button = wrapper.findAll('.range-tabs button').find((item) => item.text() === label);
      await button!.trigger('click');
      expect(wrapper.findAll('.decision-timeline__item').length).toBeGreaterThan(0);
      expect(wrapper.findAll('e-chart-panel-stub')).toHaveLength(1);
      expect(wrapper.find('.trends-chart-guide').exists()).toBe(false);
    }
  });

  it('does not render visually significant charts for a scarce sample', () => {
    const { pinia, store } = createStore();
    store.dailyEntries = [{ ...emptyDailyEntry('2026-07-21'), importantFact: 'Одна запись' }];
    const wrapper = mount(TrendsView, { global: { plugins: [pinia], stubs: { EChartPanel: true, RouterLink: routerLinkStub } } });

    expect(wrapper.findAll('.review-cue-grid--primary .review-cue').length).toBeGreaterThan(0);
    expect(wrapper.get('.trends-metric-details').attributes('open')).toBeUndefined();
    expect(wrapper.get('.trends-chart-guide').text()).toContain('Для графика пока мало записей');
    expect(wrapper.findAll('e-chart-panel-stub')).toHaveLength(0);
  });

  it('keeps a long change history on pages of ten records', async () => {
    const { pinia, store } = createStore();
    store.dailyEntries = [{ ...emptyDailyEntry('2026-07-21'), importantFact: 'Есть данные для трендов' }];
    store.results = Array.from({ length: 21 }, (_, index) => ({
      id: index + 1,
      date: '2026-07-21',
      area: 'career' as const,
      title: `Итог ${index + 1}`,
      note: '',
      createdAt: `2026-07-21T12:${String(index).padStart(2, '0')}:00.000Z`,
    }));
    const wrapper = mount(TrendsView, { global: { plugins: [pinia], stubs: { EChartPanel: true, RouterLink: routerLinkStub } } });

    expect(wrapper.findAll('.decision-timeline__item')).toHaveLength(10);
    expect(wrapper.get('.archive-pagination span').text()).toBe('1 из 3');
    expect(wrapper.text()).toContain('Итог 1');
    expect(wrapper.text()).not.toContain('Итог 11');

    await wrapper.findAll('.archive-pagination button')[1]!.trigger('click');

    expect(wrapper.findAll('.decision-timeline__item')).toHaveLength(10);
    expect(wrapper.get('.archive-pagination span').text()).toBe('2 из 3');
    expect(wrapper.findAll('.decision-timeline__item strong').map((item) => item.text())).toEqual(
      Array.from({ length: 10 }, (_, index) => `Итог ${index + 11}`),
    );

    await wrapper.findAll('.archive-pagination button')[1]!.trigger('click');

    expect(wrapper.findAll('.decision-timeline__item')).toHaveLength(1);
    expect(wrapper.get('.archive-pagination span').text()).toBe('3 из 3');
    expect(wrapper.get('.decision-timeline__item strong').text()).toBe('Итог 21');
  });

  it('does not show metric comparisons inside experiment history records', () => {
    const { pinia, store } = createStore();
    store.settings.experimentHistory = [
      {
        id: 'completed-experiment',
        title: 'Спокойный вечер',
        hypothesis: 'Станет ли легче завершать день',
        targetMetric: '',
        targetDirection: 'increase',
        minimumMeaningfulChange: null,
        startDate: '2026-07-14',
        endDate: '2026-07-21',
        targetMetricId: 'energy',
        conclusion: 'Вечером было спокойнее',
        decision: 'continue',
        completedAt: '2026-07-21T20:00:00.000Z',
      },
    ];
    const wrapper = mount(TrendsView, { global: { plugins: [pinia], stubs: { EChartPanel: true, RouterLink: routerLinkStub } } });

    expect(wrapper.text()).toContain('Спокойный вечер');
    expect(wrapper.text()).not.toContain('Показать сравнение показателей');
  });
});
