import { expect, test } from './fixtures';
import type { Locator } from '@playwright/test';
import { buildDemoPayload } from '../scripts/generate-test-user-data.mjs';
import { demoAnchor, demoFilePath, emptyPeriodDate, visualDemoAnchor, visualDemoFilePath } from './demo-data';
import {
  breakpointProbeWidths,
  expectBoxInside,
  expectHorizontalSeparation,
  expectPageFitsViewport,
  expectSamePosition,
  expectVerticalSeparation,
  readDocumentLayoutBox,
  readLayoutBox,
  sampleHeights,
  uniqueWidths,
} from './layout-assertions';

const routes = ['/today', '/week', '/month', '/trends', '/more', '/results', '/events', '/settings'];

async function observeHeightLock(list: Locator) {
  return list.evaluate(
    (element) =>
      new Promise<{ inlineHeight: string; property: string; duration: string }>((resolve) => {
        const target = element as HTMLElement;
        let finished = false;
        const observer = new MutationObserver(readTransition);
        const timeout = window.setTimeout(() => finish(), 1000);

        function finish() {
          if (finished) {
            return;
          }
          finished = true;
          observer.disconnect();
          window.clearTimeout(timeout);
          resolve({
            inlineHeight: target.style.height,
            property: getComputedStyle(target).transitionProperty,
            duration: getComputedStyle(target).transitionDuration,
          });
        }

        function readTransition() {
          if (target.style.height && target.style.height !== 'auto') {
            finish();
          }
        }

        observer.observe(target, { attributes: true, attributeFilter: ['style'] });
        readTransition();
      }),
  );
}

async function expectPeriodDetailsChrome(details: Locator) {
  await expect(details).toHaveCSS('border-top-style', 'solid');
  await expect(details).toHaveCSS('border-top-color', 'rgb(220, 229, 225)');
  await expect(details).toHaveCSS('border-radius', '16px');
  await expect(details).toHaveCSS('background-color', 'rgba(255, 255, 255, 0.72)');
  const summary = details.locator(':scope > summary');
  await expect(summary).toHaveCSS('padding-top', '16px');
  await expect(summary).toHaveCSS('padding-right', '18px');
}

test.beforeEach(async ({ page }) => {
  await page.goto('/settings');
  await page.locator('input[type="file"]').setInputFiles(demoFilePath);
  await expect(page.locator('input[type="file"]')).toHaveValue('');
});

test('uses one heading size for peer cards in weekly and monthly reviews', async ({ page }, testInfo) => {
  test.slow();
  await page.clock.setFixedTime(new Date('2026-08-30T12:00:00.000Z'));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.locator('input[type="file"]').setInputFiles(visualDemoFilePath);
  await expect(page.locator('input[type="file"]')).toHaveValue('');

  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of [`/week?week=${visualDemoAnchor}`, '/month']) {
      await page.goto(route);
      const records = page.locator('.period-records--featured');
      await expect(records.locator('h2')).toHaveCount(2);
      const headings = page.locator('.period-record-card h2:visible, .dashboard-card h2:visible, .review-card h2:visible');
      const peerSize = await page
        .locator('.period-analysis-card h2')
        .first()
        .evaluate((element) => getComputedStyle(element).fontSize);
      for (const heading of await headings.all()) {
        await expect(heading).toHaveCSS('font-size', peerSize);
        expect(await heading.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
      }
      await expectPageFitsViewport(page, `${route} at ${width}px`);
      if (width === 390 || width === 1440) {
        await records.scrollIntoViewIfNeeded();
        await page.screenshot({ path: testInfo.outputPath(`${route.startsWith('/week') ? 'week' : 'month'}-headings-${width}.png`) });
      }
    }
  }
});

test('keeps every primary screen inside the minimum viewport width', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });

  for (const route of routes) {
    await page.goto(route);
    await page.locator('.page').waitFor();
    await expectPageFitsViewport(page, route);
    const feedback = page.getByRole('button', { name: 'Обратная связь' });
    await expect(feedback).toBeVisible();
  }
});

test('groups weekly and monthly reviews under one primary navigation item', async ({ page }) => {
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 1280, height: 720 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto('/today');

    const primaryNavigation = page.getByRole('navigation', { name: 'Основная навигация' });
    const overviewLink = primaryNavigation.getByRole('link', { name: 'Обзор', exact: true });
    await expect(primaryNavigation.getByRole('link')).toHaveCount(4);
    await expect(primaryNavigation.getByRole('link', { name: 'Неделя', exact: true })).toHaveCount(0);
    await expect(primaryNavigation.getByRole('link', { name: 'Месяц', exact: true })).toHaveCount(0);

    await overviewLink.click();
    await expect(page).toHaveURL(/\/week$/);
    await expect(overviewLink).toHaveAttribute('aria-current', 'page');

    const periodNavigation = page.getByRole('navigation', { name: 'Период обзора' });
    const weekLink = periodNavigation.getByRole('link', { name: 'Неделя', exact: true });
    const monthLink = periodNavigation.getByRole('link', { name: 'Месяц', exact: true });
    await expect(weekLink).toHaveAttribute('aria-current', 'page');
    await expect(monthLink).not.toHaveAttribute('aria-current');

    await monthLink.click();
    await expect(page).toHaveURL(/\/month$/);
    await expect(overviewLink).toHaveAttribute('aria-current', 'page');
    await expect(monthLink).toHaveAttribute('aria-current', 'page');
    await expect(weekLink).not.toHaveAttribute('aria-current');

    await page.goBack();
    await expect(page).toHaveURL(/\/week$/);
    await expect(page.getByRole('navigation', { name: 'Период обзора' }).getByRole('link', { name: 'Неделя' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expectPageFitsViewport(page, `review navigation at ${viewport.width}px`);
  }
});

test('keeps archive filters aligned across responsive widths', async ({ page }) => {
  test.slow();
  const layouts = new Map<number, { height: number; searchWidth: number }>();

  for (const width of uniqueWidths([390, 768, 820, 821, 900, 1100], breakpointProbeWidths(1024))) {
    await page.setViewportSize({ width, height: 1024 });
    for (const route of ['/results', '/events']) {
      await page.goto(route);
      await page.locator('.page--archive').waitFor();

      await expectPageFitsViewport(page, `${route} at ${width}px`);

      const panel = page.locator('.archive-panel');
      const filters = page.locator('.archive-filters');
      const [panelBox, filtersBox] = await Promise.all([
        readLayoutBox(panel, `${route} panel at ${width}px`),
        readLayoutBox(filters, `${route} filters at ${width}px`),
      ]);
      expectBoxInside(filtersBox, panelBox, `${route} filters at ${width}px`);

      const fields = page.locator('.archive-filter-field');
      await expect(fields).toHaveCount(4);
      const fieldGeometry = await fields.evaluateAll((elements) =>
        elements.map((element) => {
          const label = element.querySelector<HTMLElement>('.archive-filter-field__label')!;
          const control = element.querySelector<HTMLElement>('input, select')!;
          const labelBox = label.getBoundingClientRect();
          const controlBox = control.getBoundingClientRect();
          return {
            labelTop: labelBox.top,
            controlTop: controlBox.top,
            controlHeight: controlBox.height,
            controlLeft: controlBox.left,
            controlRight: controlBox.right,
          };
        }),
      );
      const rows = fieldGeometry.reduce<Record<string, typeof fieldGeometry>>((groups, field) => {
        const key = String(Math.round(field.labelTop));
        (groups[key] ??= []).push(field);
        return groups;
      }, {});
      for (const row of Object.values(rows)) {
        expect(Math.max(...row.map((field) => field.controlTop)) - Math.min(...row.map((field) => field.controlTop))).toBeLessThanOrEqual(
          1,
        );
        expect(
          Math.max(...row.map((field) => field.controlHeight)) - Math.min(...row.map((field) => field.controlHeight)),
        ).toBeLessThanOrEqual(1);
      }
      for (const field of fieldGeometry) {
        expect(field.controlLeft).toBeGreaterThanOrEqual(filtersBox.x);
        expect(field.controlRight).toBeLessThanOrEqual(filtersBox.x + filtersBox.width);
        expect(field.controlRight - field.controlLeft).toBeGreaterThanOrEqual(140);
        expect(field.controlHeight).toBeLessThanOrEqual(52);
      }
      expect(fieldGeometry.map((field) => field.labelTop)).toEqual([...fieldGeometry.map((field) => field.labelTop)].sort((a, b) => a - b));

      const searchBox = await fields.first().locator('input').boundingBox();
      expect(searchBox).not.toBeNull();
      if (route === '/results') {
        layouts.set(width, { height: filtersBox.height, searchWidth: searchBox!.width });
      }
    }
  }

  expect(Math.abs(layouts.get(820)!.height - layouts.get(821)!.height)).toBeLessThanOrEqual(2);
  expect(Math.abs(layouts.get(820)!.searchWidth - layouts.get(821)!.searchWidth)).toBeLessThanOrEqual(2);
});

test('reflows archive filters inside their container at 200 percent', async ({ page }, testInfo) => {
  test.slow();
  for (const width of [1024, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of ['/results', '/events']) {
      await page.goto(route);
      await page.locator('.archive-filters').waitFor();
      await page.evaluate(() => {
        document.documentElement.style.zoom = '2';
      });
      await expectPageFitsViewport(page, `${route} at ${width}px / 200%`);
      const filters = page.locator('.archive-filters');
      const box = await readLayoutBox(filters, 'zoomed archive filters');
      for (const control of await filters.locator('input, select, button').all()) {
        const controlBox = await readLayoutBox(control, 'zoomed archive control');
        expectBoxInside(controlBox, box, 'zoomed control stays in its panel');
        expect(controlBox.width).toBeGreaterThanOrEqual(140);
      }
      const reset = filters.getByRole('button', { name: 'За всё время' });
      await filters.locator('input[type="date"]').first().fill('2026-01-01');
      await expect(reset).toBeEnabled();
      await reset.click();
      await expect(reset).toBeDisabled();
      await expectPageFitsViewport(page, `${route} after reset at ${width}px / 200%`);
      if (width === 1280) {
        await testInfo.attach(`${route.slice(1)}-filters-200-percent`, { body: await filters.screenshot(), contentType: 'image/png' });
      }
    }
  }
});

test('keeps archive reset geometry stable between active and inactive ranges', async ({ page }) => {
  for (const width of [390, 1100]) {
    await page.setViewportSize({ width, height: 1024 });
    for (const route of ['/results', '/events']) {
      await page.goto(route);
      const filters = page.locator('.archive-filters');
      const reset = page.getByRole('button', { name: 'За всё время' });
      await page.locator('.archive-date-filter input').first().fill(demoAnchor());
      await expect(reset).toBeEnabled();
      const beforeFilters = await readDocumentLayoutBox(filters, `${route} active filters at ${width}px`);
      const beforeReset = await readDocumentLayoutBox(reset, `${route} active reset at ${width}px`);

      await reset.click();
      await expect(reset).toBeDisabled();
      const afterFilters = await readDocumentLayoutBox(filters, `${route} inactive filters at ${width}px`);
      const afterReset = await readDocumentLayoutBox(reset, `${route} inactive reset at ${width}px`);

      expect(Math.abs(afterFilters.height - beforeFilters.height), `${route} filter height at ${width}px`).toBeLessThanOrEqual(1);
      expectSamePosition(beforeReset, afterReset, `${route} reset at ${width}px`);
    }
  }
});

test('keeps the Journal and archive chrome compact at pilot widths', async ({ page }) => {
  test.slow();

  for (const width of [390, 768, 1179]) {
    await page.setViewportSize({ width, height: 1024 });
    await page.goto('/more');
    await expectPageFitsViewport(page, `Journal at ${width}px`);

    const journalHeading = await readLayoutBox(page.locator('.page--journal > .page-heading'), `Journal heading at ${width}px`);
    const journalTitleSize = await page
      .locator('.page--journal h1')
      .evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
    const journalCards = page.locator('.more-card');
    await expect(journalCards).toHaveCount(2);
    const cardBoxes = await Promise.all([
      readLayoutBox(journalCards.nth(0), `first Journal choice at ${width}px`),
      readLayoutBox(journalCards.nth(1), `second Journal choice at ${width}px`),
    ]);
    const settingsBox = await readLayoutBox(page.locator('.journal-settings-card'), `Journal settings at ${width}px`);

    expect(journalTitleSize, `Journal title size at ${width}px`).toBeLessThanOrEqual(width <= 720 ? 34 : 44);
    expect(Math.max(...cardBoxes.map((box) => box.height)), `Journal choice height at ${width}px`).toBeLessThanOrEqual(
      width <= 760 ? 160 : 176,
    );
    expect(settingsBox.height, `Journal settings height at ${width}px`).toBeLessThanOrEqual(100);
    expectVerticalSeparation(journalHeading, cardBoxes[0], 0, `Journal heading and choices at ${width}px`);
    if (width === 390) {
      expect(cardBoxes[0].y, 'Journal choices should appear in the first mobile viewport').toBeLessThanOrEqual(300);
      expectVerticalSeparation(cardBoxes[0], cardBoxes[1], 12, 'stacked Journal choices');
    } else {
      expect(Math.abs(cardBoxes[0].y - cardBoxes[1].y), `Journal choice alignment at ${width}px`).toBeLessThanOrEqual(1);
      expect(Math.abs(cardBoxes[0].height - cardBoxes[1].height), `Journal choice height match at ${width}px`).toBeLessThanOrEqual(1);
    }

    for (const route of ['/results', '/events']) {
      await page.goto(route);
      await expectPageFitsViewport(page, `${route} compact chrome at ${width}px`);
      const heading = await readLayoutBox(page.locator('.page--archive > .page-heading'), `${route} heading at ${width}px`);
      const titleSize = await page
        .locator('.page--archive h1')
        .evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
      const composer = await readLayoutBox(page.locator('.archive-composer'), `${route} composer at ${width}px`);
      const primaryActionHeight = await page
        .locator('.archive-composer .primary-button')
        .evaluate((element) => element.getBoundingClientRect().height);

      expect(heading.height, `${route} heading height at ${width}px`).toBeLessThanOrEqual(width <= 720 ? 124 : 150);
      expect(titleSize, `${route} title size at ${width}px`).toBeLessThanOrEqual(width <= 720 ? 32 : 44);
      expect(primaryActionHeight, `${route} primary action height at ${width}px`).toBeGreaterThanOrEqual(44);
      expectVerticalSeparation(heading, composer, 0, `${route} heading and composer at ${width}px`);
    }
  }
});

test('shows an unknown user route and returns to Today with the keyboard', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto('/missing-page');

  await expect(page.getByRole('heading', { name: 'Такой страницы нет' })).toBeVisible();
  await expect(page).toHaveTitle('Страница не найдена · Траектория');
  await page.getByRole('link', { name: 'Перейти к «Сегодня»' }).focus();
  await page.getByRole('link', { name: 'Перейти к «Сегодня»' }).press('Enter');
  await expect(page).toHaveURL(/\/today$/);
});

test('keeps empty-period actions below their explanatory text', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  const emptyDate = emptyPeriodDate();

  async function expectEmptyGuideSpacing() {
    const paragraph = page.locator('.period-empty-guide p');
    const action = page.locator('.period-empty-guide .secondary-button');
    const paragraphBox = await paragraph.boundingBox();
    const actionBox = await action.boundingBox();

    expect(paragraphBox).not.toBeNull();
    expect(actionBox).not.toBeNull();
    expect(actionBox!.y).toBeGreaterThanOrEqual(paragraphBox!.y + paragraphBox!.height + 10);
  }

  await page.goto(`/week?week=${emptyDate}`);
  await expectEmptyGuideSpacing();
  await page.goto('/month');
  for (let index = 0; index < 5; index += 1) {
    await page.getByRole('button', { name: 'Предыдущий период' }).click();
  }
  await expectEmptyGuideSpacing();
});

test('keeps mobile form controls inside their cards', async ({ page }) => {
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/today');
    const overflow = await page.locator('.form-card').evaluateAll((cards) =>
      cards.flatMap((card) => {
        const cardBox = card.getBoundingClientRect();
        return Array.from(card.querySelectorAll('input, textarea, .duration-field'))
          .map((element) => ({ element, box: element.getBoundingClientRect() }))
          .filter(({ box }) => box.left < cardBox.left - 1 || box.right > cardBox.right + 1)
          .map(({ element }) => `${element.tagName.toLowerCase()}#${element.id || element.className}`);
      }),
    );
    expect(overflow, `form controls should stay inside cards at ${width}px`).toEqual([]);

    const quickCaptureBox = await page.locator('.quick-capture').boundingBox();
    const dailyNoteBox = await page.locator('.form-card--daily-summary').boundingBox();
    expect(quickCaptureBox).not.toBeNull();
    expect(dailyNoteBox).not.toBeNull();
    expectVerticalSeparation(quickCaptureBox!, dailyNoteBox!, 12, `quick actions before the daily note at ${width}px`);
  }
});

test('separates month metric controls from the chart and keeps compact daily actions visible', async ({ page }) => {
  await page.clock.setFixedTime(new Date(`${visualDemoAnchor}T12:00:00.000Z`));
  await page.locator('input[type="file"]').setInputFiles(visualDemoFilePath);
  await expect(page.locator('input[type="file"]')).toHaveValue('');
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 1280, height: 720 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto('/month');
    await page.locator('.month-analysis-details > summary').click();

    for (const layout of [
      { switcher: '.month-metric-card .metric-switcher', chart: '.month-metric-card .echart-panel' },
      { switcher: '.trend-metric-switcher', chart: '.trend-metric-card .echart-panel' },
    ]) {
      if (layout.switcher === '.trend-metric-switcher') {
        await page.goto('/trends');
        await page.locator('.trends-metric-details > summary').click();
      }

      const switcherBox = await page.locator(layout.switcher).boundingBox();
      const chartBox = await page.locator(layout.chart).boundingBox();
      expect(switcherBox).not.toBeNull();
      expect(chartBox).not.toBeNull();
      expect(chartBox!.y - (switcherBox!.y + switcherBox!.height)).toBeGreaterThanOrEqual(14);
    }
  }

  await page.goto('/today');
  const settingsAction = page.locator('.daily-layout-settings .secondary-button');
  const goalAction = page.locator('#goal-actions .card-settings-link');
  await expect(settingsAction).toBeVisible();
  await expect(goalAction).toBeVisible();
  await expect(goalAction).toHaveText('Изменить');
});

test('separates analysis guidance from insights and centers period arrows', async ({ page }) => {
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 1280, height: 720 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto('/trends');

    await expect(page.locator('.history-external-analysis')).not.toHaveAttribute('open', '');
    await page.locator('.history-external-analysis > summary').click();
    const guidanceBox = await readLayoutBox(
      page.locator('.history-external-analysis > .ai-analysis-steps'),
      `analysis guidance at ${viewport.width}px`,
    );
    const insightsBox = await readLayoutBox(page.locator('.history-overview-card > .review-cue-grid'), `insights at ${viewport.width}px`);
    expectVerticalSeparation(insightsBox, guidanceBox, 16, `analysis guidance and insights at ${viewport.width}px`);

    for (const route of ['/week', '/month']) {
      await page.goto(route);
      const controls = page.locator('.period-nav > .icon-button');
      await expect(controls).toHaveCount(2);

      for (let index = 0; index < 2; index += 1) {
        const control = await readLayoutBox(controls.nth(index), `${route} period control ${index} at ${viewport.width}px`);
        const icon = await readLayoutBox(controls.nth(index).locator('.ui-icon'), `${route} period icon ${index} at ${viewport.width}px`);
        expect(Math.abs(icon.x + icon.width / 2 - (control.x + control.width / 2))).toBeLessThanOrEqual(1);
        expect(Math.abs(icon.y + icon.height / 2 - (control.y + control.height / 2))).toBeLessThanOrEqual(1);
      }
    }
  }
});

test('separates the custom-period action from adjacent review content', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });

  for (const route of ['/week', '/month', '/trends']) {
    await page.goto(route);
    if (route !== '/trends') {
      await page.locator('.period-analysis-card__external > summary').click();
    }
    const action = page.locator('.range-custom-action');
    await expect(action).toBeVisible();
    const spacing = await action.evaluate((element) => {
      const box = element.getBoundingClientRect();
      const previousBox = element.previousElementSibling?.getBoundingClientRect();
      const nextBox = element.nextElementSibling?.getBoundingClientRect();
      const cardBox = element.closest('.period-analysis-card')?.getBoundingClientRect();
      const linkBox = element.querySelector('a')?.getBoundingClientRect();
      let after: number;
      if (nextBox) {
        after = nextBox.top - box.bottom;
      } else if (cardBox) {
        after = cardBox.bottom - box.bottom;
      } else {
        after = Number.parseFloat(getComputedStyle(element).marginBottom);
      }
      return {
        before: previousBox ? box.top - previousBox.bottom : 0,
        after,
        linkInside: linkBox ? linkBox.left >= box.left && linkBox.right <= box.right : false,
      };
    });

    expect(spacing.before, `${route} should leave space before the custom-period action`).toBeGreaterThanOrEqual(14);
    expect(spacing.after, `${route} should leave space after the custom-period action`).toBeGreaterThanOrEqual(12);
    expect(spacing.linkInside, `${route} action should stay inside its card`).toBe(true);
  }
});

test('keeps history entry colors aligned with the type summary', async ({ page }) => {
  test.slow();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/trends');
  const history = page.locator('.history-timeline--featured');
  await expect(history).toBeVisible();

  const summaryItems = history.locator('.history-timeline__summary > span');
  const readSummaryColors = () =>
    summaryItems.evaluateAll((elements) =>
      Object.fromEntries(
        elements.map((element) => {
          const toneClass = [...element.classList].find((name) => name.startsWith('history-timeline__summary-item--')) ?? '';
          const tone = toneClass.replace('history-timeline__summary-item--', '');
          return [tone, getComputedStyle(element.querySelector('i')!).backgroundColor];
        }),
      ),
    );
  await expect
    .poll(async () => {
      const colors = Object.values(await readSummaryColors());
      return colors.length > 0 && colors.every(Boolean);
    })
    .toBe(true);
  const summaryColors = await readSummaryColors();
  expect(new Set(Object.values(summaryColors)).size).toBe(Object.keys(summaryColors).length);

  const entryColors: Record<string, string> = {};
  const entries = history.locator('.history-timeline__list > article');
  const readEntryColors = () =>
    entries.evaluateAll((elements) =>
      Object.fromEntries(
        elements.map((element) => {
          const toneClass = [...element.classList].find((name) => name.startsWith('history-timeline__item--')) ?? '';
          const tone = toneClass.replace('history-timeline__item--', '');
          return [tone, getComputedStyle(element, '::before').backgroundColor];
        }),
      ),
    );
  const nextPage = history.locator('.archive-pagination button', { hasText: 'Дальше' });
  const transitioningEntries = history.locator('.reveal-list-enter-active, .reveal-list-leave-active');
  for (let pageNumber = 1; pageNumber <= 20; pageNumber += 1) {
    await expect(transitioningEntries).toHaveCount(0);
    const currentEntryColors = await readEntryColors();
    expect(Object.values(currentEntryColors).every(Boolean)).toBe(true);
    Object.assign(entryColors, currentEntryColors);
    if (await nextPage.isDisabled()) {
      break;
    }
    await nextPage.click();
    await expect(history.locator('.archive-pagination span')).toHaveText(new RegExp(`^${pageNumber + 1} из \\d+$`));
  }

  expect(Object.keys(entryColors).sort()).toEqual(Object.keys(summaryColors).sort());
  for (const [tone, color] of Object.entries(summaryColors)) {
    expect(entryColors[tone], `${tone} entries should use their summary color`).toBe(color);
  }
});

test('keeps change history visible and one metric behind a compact mobile disclosure', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/trends');

  const insights = page.locator('.dashboard-card--insights');
  const history = page.locator('.history-timeline--featured');
  const metric = page.locator('.trends-metric-details');
  await expect(insights).toBeVisible();
  await expect(history).toBeVisible();
  await expect(metric).not.toHaveAttribute('open', '');
  await expect(history.locator('.decision-timeline__item')).toHaveCount(10);
  await expect(history.locator('.archive-pagination')).toBeVisible();
  await expect(history.locator('.archive-pagination span')).toHaveText(/^1 из \d+$/);
  const primaryCueCount = await page.locator('.review-cue-grid--primary .review-cue').count();
  expect(primaryCueCount).toBeGreaterThan(0);
  expect(primaryCueCount).toBeLessThanOrEqual(3);

  const insightsBox = await insights.boundingBox();
  const historyBox = await history.boundingBox();
  expect(insightsBox).not.toBeNull();
  expect(historyBox).not.toBeNull();
  expect(historyBox!.y).toBeGreaterThan(insightsBox!.y);

  await metric.locator(':scope > summary').click();
  await expect(metric).toHaveAttribute('open', '');
  await expect(metric.locator('.metric-switcher')).toBeVisible();
  await expect(page.locator('.trend-table')).toHaveCount(0);

  const list = history.locator('.history-timeline__list');
  const initialListHeight = await list.evaluate((element) => element.getBoundingClientRect().height);
  const transitionHeightsPromise = sampleHeights(list);
  await history.locator('.archive-pagination button', { hasText: 'Дальше' }).click();
  const transitionHeights = await transitionHeightsPromise;
  await expect(history.locator('.decision-timeline__item')).toHaveCount(10);
  await expect(history.locator('.archive-pagination span')).toHaveText(/^2 из \d+$/);
  const finalListHeight = transitionHeights.at(-1)!;
  expect(Math.min(...transitionHeights)).toBeGreaterThanOrEqual(Math.min(initialListHeight, finalListHeight) - 2);
  expect(Math.max(...transitionHeights)).toBeLessThanOrEqual(Math.max(initialListHeight, finalListHeight) + 2);

  const widths = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }));
  expect(widths.content).toBeLessThanOrEqual(widths.viewport);
});

for (const scenario of [
  { route: '/trends', list: '.history-timeline__list', pagination: '.history-timeline .archive-pagination', width: 390 },
  { route: '/trends', list: '.history-timeline__list', pagination: '.history-timeline .archive-pagination', width: 1280 },
  { route: '/results', list: '.results-list', pagination: '.archive-panel .archive-pagination', width: 390 },
  { route: '/events', list: '.timeline-list', pagination: '.archive-panel .archive-pagination', width: 390 },
]) {
  test(`moves ${scenario.route} list height smoothly at ${scenario.width}px`, async ({ page }) => {
    await page.setViewportSize({ width: scenario.width, height: 1024 });
    await page.goto(scenario.route);
    if (scenario.route === '/results' || scenario.route === '/events') {
      await expect(page.getByRole('button', { name: 'За всё время' })).toBeDisabled();
    }
    const list = page.locator(scenario.list);
    const pagination = page.locator(scenario.pagination);
    await expect(pagination).toBeVisible();

    const pageCount = Number((await pagination.locator('span').textContent())?.split(' из ')[1]);
    expect(pageCount, `${scenario.route} should have enough data to test pagination`).toBeGreaterThan(1);
    for (let currentPage = 1; currentPage < pageCount - 1; currentPage += 1) {
      await pagination.getByRole('button', { name: 'Дальше' }).click();
      await expect(pagination.locator('span')).toHaveText(`${currentPage + 1} из ${pageCount}`);
    }

    const initialHeight = await list.evaluate((element) => element.getBoundingClientRect().height);
    const heightLockPromise = observeHeightLock(list);
    const samplesPromise = sampleHeights(list, 450);
    await pagination.getByRole('button', { name: 'Дальше' }).click();
    const activeTransition = await heightLockPromise;
    expect(activeTransition.property).toContain('height');
    expect(activeTransition.duration).not.toBe('0s');
    const samples = await samplesPromise;
    await expect(pagination.locator('span')).toHaveText(`${pageCount} из ${pageCount}`);
    await expect.poll(() => list.evaluate((element) => element.style.height)).toBe('');
    const finalHeight = await list.evaluate((element) => element.getBoundingClientRect().height);

    if (Math.abs(finalHeight - initialHeight) >= 1) {
      expect(activeTransition.inlineHeight, `${scenario.route} at ${scenario.width}px should lock the previous height`).not.toBe('');
    } else {
      expect(activeTransition.inlineHeight, `${scenario.route} at ${scenario.width}px should skip equal-height motion`).toBe('');
    }

    expect(Math.min(...samples), `${scenario.route} at ${scenario.width}px should not collapse`).toBeGreaterThan(0);
  });
}

test('keeps the document position within its scroll range while paging the change history', async ({ page }) => {
  test.slow();
  const anchor = '2026-10-02';
  await page.clock.setFixedTime(new Date(`${anchor}T12:00:00.000Z`));
  const payload = buildDemoPayload(anchor);
  payload.dailyEntries = [];
  payload.results = [];
  payload.weeklyReviews = [];
  payload.monthlyReviews = [];
  payload.settings.experimentHistory = [];
  payload.lifeEvents = Array.from({ length: 20 }, (_, index) => ({
    ...payload.lifeEvents[0],
    id: index + 1,
    date: index < 10 ? anchor : '2026-10-01',
    title: `Событие ${index + 1}`,
    note: index < 10 ? 'Подробная заметка о событии и его обстоятельствах. '.repeat(20) : '',
    createdAt: `${anchor}T12:${String(index).padStart(2, '0')}:00.000Z`,
  }));
  await page.locator('input[type="file"]').setInputFiles({
    name: 'history-pagination.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(payload)),
  });
  await expect(page.locator('input[type="file"]')).toHaveValue('');
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 1280, height: 720 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto('/trends');

    const history = page.locator('.history-timeline--featured');
    const pagination = history.locator('.archive-pagination');
    const pageLabel = pagination.locator('span');
    await expect(pagination).toBeVisible();
    await expect(pageLabel).toHaveText('1 из 2');
    await expect(history.locator('.history-timeline__list > article').first()).toContainText('Подробная заметка');

    async function placePaginationInViewport() {
      const documentTop = await pagination.evaluate((element) => element.getBoundingClientRect().top + window.scrollY);
      await page.evaluate((top) => window.scrollTo(0, Math.max(0, top - 560)), documentTop);
      await expect(pagination).toBeInViewport();
      return page.evaluate(() => window.scrollY);
    }

    const beforeNext = await placePaginationInViewport();
    const next = pagination.getByRole('button', { name: 'Дальше' });
    await next.click();
    await expect(pageLabel).toHaveText(/^2 из \d+$/);
    await page.waitForTimeout(550);
    const afterNext = await page.evaluate(() => ({
      top: window.scrollY,
      maximum: Math.max(0, document.documentElement.scrollHeight - window.innerHeight),
    }));
    expect(beforeNext, 'The shorter page must exercise the browser scroll boundary').toBeGreaterThan(afterNext.maximum);
    expect(afterNext.top).toBeCloseTo(Math.min(beforeNext, afterNext.maximum), 0);

    const beforePrevious = await placePaginationInViewport();
    await pagination.getByRole('button', { name: 'Назад' }).click();
    await expect(pageLabel).toHaveText(/^1 из \d+$/);
    await page.waitForTimeout(550);
    const afterPrevious = await page.evaluate(() => ({
      top: window.scrollY,
      maximum: Math.max(0, document.documentElement.scrollHeight - window.innerHeight),
    }));
    expect(afterPrevious.top).toBeCloseTo(Math.min(beforePrevious, afterPrevious.maximum), 0);
  }
});

test('reserves header space while the feedback action loads', async ({ browser }) => {
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 1280, height: 720 },
  ]) {
    const context = await browser.newContext({ viewport });
    const isolatedPage = await context.newPage();
    let releaseFeedbackModule!: () => void;
    let markFeedbackModuleRequested!: () => void;
    const feedbackModuleRequested = new Promise<void>((resolve) => {
      markFeedbackModuleRequested = resolve;
    });
    const feedbackModuleReleased = new Promise<void>((resolve) => {
      releaseFeedbackModule = resolve;
    });

    await isolatedPage.route('**/src/features/feedback/ui/FeedbackDialog.vue*', async (route) => {
      markFeedbackModuleRequested();
      await feedbackModuleReleased;
      await route.continue();
    });

    try {
      await isolatedPage.goto('/today');
      await feedbackModuleRequested;
      const help = isolatedPage.getByRole('button', { name: 'Как работает приложение' });
      await expect(help).toBeVisible();
      const before = await readLayoutBox(help, `help before feedback at ${viewport.width}px`);

      releaseFeedbackModule();
      await expect(isolatedPage.getByRole('button', { name: 'Обратная связь' })).toBeVisible();
      const after = await readLayoutBox(help, `help after feedback at ${viewport.width}px`);
      expectSamePosition(before, after, `help while feedback loads at ${viewport.width}px`);
    } finally {
      releaseFeedbackModule();
      await context.close();
    }
  }
});

test('removes paginated list motion when reduced motion is requested', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/trends');
  const list = page.locator('.history-timeline__list');
  await expect(list).toHaveCSS('transition-duration', '0s');
  await page.locator('.history-timeline .archive-pagination').getByRole('button', { name: 'Дальше' }).click();
  await expect(page.locator('.history-timeline .archive-pagination span')).toHaveText(/^2 из \d+$/);
  await expect.poll(() => list.evaluate((element) => element.style.height)).toBe('');
});

for (const width of [320, 361, 390, 480, 719, 720, 721]) {
  test(`keeps the daily heading text separate from its date control at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/today');
    await page.locator('.page--today').waitFor();
    await page.evaluate(() => document.fonts.ready);

    async function expectHeadingFits() {
      const heading = await readLayoutBox(page.locator('.page--today > .page-heading'), 'daily heading');
      const date = await readLayoutBox(page.getByRole('button', { name: 'Выбрать дату записи' }), 'date control');
      const text = await page.locator('.page--today > .page-heading h1').evaluate((element) => {
        const range = document.createRange();
        range.selectNodeContents(element);
        const box = range.getBoundingClientRect();
        return { x: box.x, y: box.y, width: box.width, height: box.height };
      });
      expectBoxInside(text, heading, 'daily heading text');
      const separated = text.x + text.width + 4 <= date.x || text.y + text.height + 4 <= date.y;
      expect(separated, 'the date control must not cover heading text').toBe(true);
    }

    await expectHeadingFits();
    await page.getByLabel('Дата записи', { exact: true }).evaluate((input) => {
      (input as HTMLInputElement).value = '2026-08-30';
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await expect(page.locator('.page--today > .page-heading h1')).toContainText('августа');
    await expectHeadingFits();
  });
}

test('separates daily layout settings from collapsed and expanded additional sections', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/today');
  await page.getByLabel('Дата записи', { exact: true }).evaluate((input, value) => {
    (input as HTMLInputElement).value = value;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, emptyPeriodDate());
  const additional = page.locator('.daily-additional-blocks');
  const settings = page.locator('.daily-layout-settings');
  await expect(additional).toBeVisible();
  await expect(settings).toBeVisible();
  await expect(page.locator('form + .daily-layout-settings')).toBeVisible();

  for (const width of [320, 390, 768, 980, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const expanded of [false, true]) {
      const isExpanded = (await additional.getAttribute('open')) !== null;
      if (isExpanded !== expanded) {
        await additional.locator('summary').click();
      }
      expectVerticalSeparation(
        await readLayoutBox(additional, 'additional sections'),
        await readLayoutBox(settings, 'daily layout settings'),
        12,
        `daily settings gap at ${width}px, expanded=${expanded}`,
      );
      await expectPageFitsViewport(page, `daily settings at ${width}px`);
      if (!expanded && (width === 390 || width === 980)) {
        await settings.scrollIntoViewIfNeeded();
        await page.screenshot({ path: testInfo.outputPath(`daily-settings-${width}.png`) });
      }
    }
  }
  await settings.getByRole('link', { name: 'Настроить главную' }).click();
  await expect(page).toHaveURL(/\/settings#daily-blocks$/);
});

test('keeps the returning daily form compact and visibly grouped', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/today');

  const headingBox = await page.locator('.page--today > .page-heading').boundingBox();
  expect(headingBox).not.toBeNull();
  expect(headingBox!.height).toBeLessThanOrEqual(150);
  await expect(page.getByText('Запись за дату', { exact: true })).toBeVisible();
  await expect(page.getByText('Состояние и условия', { exact: true })).toBeVisible();
  await expect(page.locator('form').getByText('Текущая цель', { exact: true })).toBeVisible();
  await expect(page.getByText('Дополнительные разделы', { exact: true })).toBeVisible();
  await expect(page.getByText('Заметка дня', { exact: true })).toBeVisible();
  await expect(page.getByText('Сон перед этой датой и сколько сил было в этот день.', { exact: true })).toBeHidden();

  const goalCard = page.locator('#goal-actions');
  const additionalBlocks = page.locator('.daily-additional-blocks');
  const workCard = page.locator('#career');
  const goalBox = await goalCard.boundingBox();
  const quickCaptureBox = await page.locator('.quick-capture').boundingBox();
  const additionalBlocksBox = await additionalBlocks.boundingBox();
  expect(goalBox).not.toBeNull();
  expect(quickCaptureBox).not.toBeNull();
  expect(additionalBlocksBox).not.toBeNull();
  const summaryBox = await readLayoutBox(page.locator('.form-card--daily-summary'), 'daily note');
  expectVerticalSeparation(quickCaptureBox!, summaryBox, 12, 'quick capture before daily note');
  expect(goalBox!.y).toBeLessThan(additionalBlocksBox!.y);
  await expect(additionalBlocks).not.toHaveAttribute('open', '');
  await additionalBlocks.locator('summary').click();
  await expect(additionalBlocks).toHaveAttribute('open', '');
  const expandedGoalBox = await goalCard.boundingBox();
  const workBox = await workCard.boundingBox();
  expect(expandedGoalBox).not.toBeNull();
  expect(workBox).not.toBeNull();
  expect(expandedGoalBox!.y).toBeLessThan(workBox!.y);
  await expect(workCard.locator('textarea')).toHaveCount(0);

  const dailySummaryHeadingBox = await page.getByText('Заметка дня', { exact: true }).boundingBox();
  const dailySummaryCardBox = await page.locator('.form-card--daily-summary').boundingBox();
  expect(dailySummaryHeadingBox).not.toBeNull();
  expect(dailySummaryCardBox).not.toBeNull();
  expect(dailySummaryHeadingBox!.y).toBeGreaterThan(dailySummaryCardBox!.y);
  expect(dailySummaryCardBox!.y).toBeLessThan(goalBox!.y);

  const goalCriteria = goalCard.locator('.goal-context-details');
  await expect(goalCriteria).not.toHaveAttribute('open', '');
  await goalCriteria.locator('summary').focus();
  await goalCriteria.locator('summary').press('Enter');
  await expect(goalCriteria).toHaveAttribute('open', '');

  await page.getByPlaceholder('Например: после прогулки стало легче собраться с мыслями').fill('Проверка fixed-сохранения');
  const floatingSave = page.locator('.floating-save-button');
  await expect(floatingSave).toBeVisible();
  await expect(floatingSave).toHaveCSS('position', 'fixed');
  const floatingSaveBox = await floatingSave.boundingBox();
  expect(floatingSaveBox).not.toBeNull();
  expect(floatingSaveBox!.x + floatingSaveBox!.width).toBeLessThanOrEqual(1280);
  expect(floatingSaveBox!.y + floatingSaveBox!.height).toBeLessThanOrEqual(720);
});

test('keeps the save action above tablet bottom navigation', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto('/today');
  await page.getByPlaceholder('Например: после прогулки стало легче собраться с мыслями').fill('Проверка сохранения на планшете');

  const floatingSave = page.locator('.floating-save-button');
  const bottomNavigation = page.locator('.bottom-nav');
  await expect(floatingSave).toBeVisible();
  const floatingSaveBox = await floatingSave.boundingBox();
  const bottomNavigationBox = await bottomNavigation.boundingBox();
  expect(floatingSaveBox).not.toBeNull();
  expect(bottomNavigationBox).not.toBeNull();
  expect(floatingSaveBox!.y + floatingSaveBox!.height).toBeLessThanOrEqual(bottomNavigationBox!.y - 10);
});

test('keeps result details editable when Backspace clears the field', async ({ page }) => {
  await page.goto('/results');
  await page.locator('.archive-add > summary').click();
  const details = page.locator('.result-composer textarea');

  await expect(details).toBeVisible();
  await expect(details).toHaveAttribute('rows', '4');
  await details.fill('Т');
  await details.press('Backspace');
  await expect(details).toHaveValue('');
  await expect(details).toBeFocused();
  await details.press('Backspace');
  await expect(page).toHaveURL(/\/results$/);
  await expect(page.locator('.result-composer details')).toHaveCount(0);

  await page.goto('/events');
  await page.locator('.archive-add > summary').click();
  await expect(page.locator('.result-composer textarea')).toBeVisible();
  await expect(page.locator('.result-composer textarea')).toHaveAttribute('rows', '4');
});

test('explains the app from the permanent help button', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/today');
  await page.evaluate(() => window.scrollTo(0, 320));
  const scrollBeforeOpen = await page.evaluate(() => window.scrollY);
  await page.getByRole('button', { name: 'Как работает приложение' }).click();
  const dialog = page.getByRole('dialog', { name: 'Зачем нужна «Траектория»' });

  await expect(dialog.locator('.help-steps > li')).toHaveCount(3);
  await expect(dialog).toContainText('Записать важное');
  await expect(dialog).toContainText('Вернуться к записям');
  await expect(dialog).toContainText('Записать мысли и планы');
  await expect(page.locator('body')).toHaveCSS('position', 'fixed');
  const dialogActions = dialog.locator(':scope > .help-dialog__actions > a');
  const analysisLink = dialog.getByRole('link', { name: 'Подготовить текст для нейросети' });
  await expect(analysisLink).toHaveCSS('display', 'flex');
  await expect(analysisLink).toHaveCSS('background-color', 'rgb(233, 238, 234)');
  await expect(dialogActions).toHaveCount(2);
  await expect(dialogActions.nth(0)).toHaveCSS('text-align', 'center');
  await expect(dialogActions.nth(1)).toHaveCSS('text-align', 'center');
  await page.getByRole('button', { name: 'Закрыть объяснение' }).click();
  await expect(page.getByRole('button', { name: 'Как работает приложение' })).toBeFocused();
  await expect(page.locator('body')).not.toHaveCSS('position', 'fixed');
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(scrollBeforeOpen);

  await page.getByRole('button', { name: 'Как работает приложение' }).click();
  await dialog.getByRole('link', { name: 'Настроить записи' }).click();
  await expect(page).toHaveURL(/\/settings#daily-settings$/);
  await expect(page.getByRole('button', { name: 'Ежедневная запись' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#daily-settings')).toBeVisible();
});

test('opens the exact settings section from a daily card', async ({ page }) => {
  await page.goto('/today');
  await page.locator('.daily-additional-blocks > summary').click();
  await page.locator('#life-areas').getByRole('link', { name: 'Настроить' }).click();

  await expect(page).toHaveURL(/\/settings#life-areas$/);
  await expect(page.locator('#life-areas')).toBeInViewport();
});

test('switches settings scenarios with the keyboard on a mobile screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/settings');

  const dataTab = page.getByRole('button', { name: 'Данные и синхронизация' });
  await dataTab.focus();
  await dataTab.press('Enter');
  await expect(page.locator('#data-settings')).toBeVisible();
  await expect(page.locator('#data-settings')).toHaveCSS('animation-name', 'page-in');
  await expect(page.locator('#daily-settings')).toBeHidden();
  await expect(page.locator('.settings-card--cloud')).toBeVisible();
  await expect(page.locator('.settings-card--account')).toBeHidden();

  const cloudStatusBox = await page.locator('.settings-card--cloud .cloud-sync-note').boundingBox();
  expect(cloudStatusBox).not.toBeNull();
  const cloudActions = page.locator('.settings-card--cloud .data-actions');
  if ((await cloudActions.count()) > 0) {
    const cloudActionsBox = await cloudActions.boundingBox();
    expect(cloudActionsBox).not.toBeNull();
    expect(cloudActionsBox!.y - (cloudStatusBox!.y + cloudStatusBox!.height)).toBeGreaterThanOrEqual(10);
  }

  await page.locator('#analysis-settings .analysis-range > summary').click();
  const rangeFieldsBox = await page.locator('#analysis-settings .analysis-range .form-row').boundingBox();
  const rangeActionsBox = await page.locator('#analysis-settings .analysis-range .ai-actions').boundingBox();
  expect(rangeFieldsBox).not.toBeNull();
  expect(rangeActionsBox).not.toBeNull();
  expect(rangeActionsBox!.y - (rangeFieldsBox!.y + rangeFieldsBox!.height)).toBeGreaterThanOrEqual(10);

  await page.getByRole('button', { name: 'Аккаунт и безопасность' }).click();
  await expect(page.locator('#account-settings')).toBeVisible();
  await expect(page.locator('#data-settings')).toBeHidden();

  const widths = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }));
  expect(widths.content).toBeLessThanOrEqual(widths.viewport);
});

test('sends feedback from the built-in form without asking for recipient details', async ({ page }) => {
  let submittedMessage = '';
  await page.route('/api/feedback', async (route) => {
    submittedMessage = ((await route.request().postDataJSON()) as { message: string }).message;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
  });
  await page.goto('/today');

  await page.getByRole('button', { name: 'Обратная связь' }).click();
  const dialog = page.getByRole('dialog', { name: 'Написать разработчику' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Предложение, проблема или ошибка').fill('Добавьте короткую подсказку к недельному обзору.');
  await dialog.getByRole('button', { name: 'Отправить', exact: true }).click();

  await expect(page.getByText('Спасибо, сообщение отправлено', { exact: true })).toBeVisible();
  expect(submittedMessage).toBe('Добавьте короткую подсказку к недельному обзору.');
});

test('opens period review forms from the summary shortcuts', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });

  for (const [route, target] of [
    ['/week', '#week-review'],
    ['/month', '#month-review'],
  ] as const) {
    await page.goto(route);
    const shortcut = page.locator(`a[href="${target}"]`);
    for (let index = 0; index < 8 && !(await shortcut.isVisible()); index += 1) {
      await page.getByRole('button', { name: 'Предыдущий период' }).click();
    }
    await shortcut.click();
    await expect(page).toHaveURL(new RegExp(`${target}$`));
    await expect(page.locator(target)).toBeInViewport();
  }
});

test('keeps monthly results before the review and secondary context behind a disclosure', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-08-30T12:00:00.000Z'));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/settings');
  await page.locator('input[type="file"]').setInputFiles(visualDemoFilePath);
  await expect(page.locator('input[type="file"]')).toHaveValue('');
  await page.goto('/month');
  await page.getByRole('button', { name: 'Предыдущий период' }).click();
  await expect(page.locator('.month-featured-events')).toHaveCount(0);
  await expect(page.locator('.month-facts-details')).toHaveCount(0);
  await expect(page.locator('.month-analysis-details')).not.toHaveAttribute('open', '');
  await expectPeriodDetailsChrome(page.locator('.month-analysis-details'));

  const records = page.locator('.period-records--featured');
  await expect(records.getByText('Итоги месяца', { exact: true })).toBeVisible();
  await expect(records.getByText('События месяца', { exact: true })).toBeVisible();
  await expect(records.locator('.period-record-preview').first().locator('li')).toHaveCount(5);
  await expect(records.getByRole('navigation', { name: 'Страницы итогов месяца' })).toBeVisible();
  await expect(records.getByRole('link', { name: 'Открыть все итоги' })).toHaveCount(0);
  await expect(records.getByRole('link', { name: 'Открыть все события' })).toHaveCount(0);

  const reviewBox = await page.locator('#month-review').boundingBox();
  const recordsBox = await records.boundingBox();
  expect(reviewBox).not.toBeNull();
  expect(recordsBox).not.toBeNull();
  expect(recordsBox!.y).toBeLessThan(reviewBox!.y);

  await records.getByRole('navigation', { name: 'Страницы итогов месяца' }).getByRole('button', { name: 'Дальше' }).click();
  await expect(records.getByRole('navigation', { name: 'Страницы итогов месяца' })).toContainText('2 из');
  const secondaryRecords = page.locator('details.period-records');
  await expectPeriodDetailsChrome(secondaryRecords);
  await secondaryRecords.getByText('Показать действия, заметки и особые дни', { exact: true }).click();
  await secondaryRecords.getByText('Конкретные действия и подготовка', { exact: true }).click();
  await expect(secondaryRecords.getByRole('navigation', { name: 'Страницы действий месяца' })).toBeVisible();
});

test('keeps weekly facts, observations, reflection and external analysis in decision order', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/week?week=${demoAnchor()}`);
  const records = page.locator('.period-records--featured');
  await expect(records.getByText('Итоги недели', { exact: true })).toBeVisible();
  await expect(records.getByText('События недели', { exact: true })).toBeVisible();
  await expect(records.getByRole('link', { name: 'Открыть все итоги' })).toHaveCount(0);
  await expect(records.getByRole('link', { name: 'Открыть все события' })).toHaveCount(0);
  const observations = page.locator('.period-analysis-card:not(#ai-analysis)');
  const review = page.locator('#week-review');
  const externalAnalysis = page.locator('#ai-analysis');
  const details = page.locator('.week-data-details');
  await expect(observations.locator('.review-cue-grid')).toBeVisible();
  await expect(observations.locator('.period-actions')).toHaveCount(0);
  await expect(externalAnalysis.locator('details')).not.toHaveAttribute('open', '');
  await externalAnalysis.locator('summary').click();
  await expect(externalAnalysis.getByRole('button', { name: 'Скопировать текст для нейросети' })).toBeVisible();
  await expect(externalAnalysis.locator('.review-cue-grid')).toHaveCount(0);
  await expect(details).not.toHaveAttribute('open', '');
  await expectPeriodDetailsChrome(details);

  const positions = await Promise.all(
    [records, observations, details, review, externalAnalysis].map(async (locator) => (await locator.boundingBox())?.y ?? -1),
  );
  expect(positions).toEqual([...positions].sort((left, right) => left - right));
});

test('keeps desktop navigation visible while the page scrolls', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/trends');
  const navigation = page.locator('.bottom-nav');
  await expect(navigation).toHaveCSS('position', 'fixed');
  const initialTop = (await navigation.boundingBox())?.y;

  await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight }));
  await expect.poll(async () => (await navigation.boundingBox())?.y).toBe(initialTop);
});

test('keeps navigation clear of the header controls around its desktop breakpoint', async ({ page }) => {
  for (const width of uniqueWidths(breakpointProbeWidths(980), [1100, 1280, 1514])) {
    await page.setViewportSize({ width, height: 720 });
    await page.goto('/today');
    await expectPageFitsViewport(page, `application chrome at ${width}px`);

    const headerBox = await readLayoutBox(page.locator('.app-header'), `header at ${width}px`);
    const brandBox = await readLayoutBox(page.locator('.brand'), `brand at ${width}px`);
    const navigationBox = await readLayoutBox(page.locator('.bottom-nav'), `navigation at ${width}px`);
    const actionsBox = await readLayoutBox(page.locator('.header-actions'), `header actions at ${width}px`);
    if (width < 980) {
      expectVerticalSeparation(headerBox, navigationBox, 0, `header and bottom navigation at ${width}px`);
      continue;
    }
    expectHorizontalSeparation(brandBox, navigationBox, 8, `brand and navigation at ${width}px`);
    expectHorizontalSeparation(navigationBox, actionsBox, 8, `navigation and actions at ${width}px`);
  }
});
