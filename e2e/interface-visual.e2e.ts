import { resolve } from 'node:path';
import { expect, test, type Page } from './fixtures';
import { visualDemoAnchor, visualDemoFilePath } from './demo-data';

const visualStylePath = resolve(process.cwd(), 'e2e/visual-regression.css');

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-08-30T12:00:00.000Z'));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/settings');
  await page.locator('input[type="file"]').setInputFiles(visualDemoFilePath);
  await expect(page.locator('input[type="file"]')).toHaveValue('');
});

async function expectInterfaceScreenshot(page: Page, name: string) {
  const platformSnapshotName = name.replace(/\.png$/, `-${process.platform}.png`);
  await page.evaluate(() => document.fonts.ready);
  await expect.soft(page).toHaveScreenshot(platformSnapshotName, {
    animations: 'disabled',
    caret: 'hide',
    maxDiffPixelRatio: 0.03,
    stylePath: visualStylePath,
  });
}

async function stabilizePeriodDates(page: Page, title: string, subtitle: string) {
  await page.locator('.period-nav__label strong').evaluate((element, value) => {
    element.textContent = value;
  }, title);
  await page.locator('.period-nav__label span').evaluate((element, value) => {
    element.textContent = value;
  }, subtitle);
}

test('keeps the polished period views visually stable on mobile', async ({ page }) => {
  await page.goto(`/week?week=${visualDemoAnchor}`);
  await page.locator('.page--week').waitFor();
  await stabilizePeriodDates(page, '24 — 30 авг.', 'Выбранная неделя');
  await expectInterfaceScreenshot(page, 'period-week-mobile.png');

  await page.goto('/month');
  await page.locator('.page--month').waitFor();
  await stabilizePeriodDates(page, 'август 2026', 'Выбранный месяц');
  await expectInterfaceScreenshot(page, 'period-month-mobile.png');

  await page.goto('/trends');
  await page.locator('.page--trends').waitFor();
  await expectInterfaceScreenshot(page, 'trends-mobile.png');
});

test('keeps the results archive visually stable on mobile', async ({ page }) => {
  await page.goto('/results');
  await page.locator('.page--results').waitFor();
  await page.locator('.archive-panel').scrollIntoViewIfNeeded();
  await page.locator('.archive-date-filter input').evaluateAll((inputs) => {
    for (const input of inputs) {
      (input as HTMLInputElement).value = '2026-08-25';
    }
  });
  await page.locator('.archive-date-filter__state').evaluate((element) => {
    element.textContent = 'Показаны записи за выбранную дату.';
  });
  await page
    .locator('.result-item small')
    .evaluateAll((elements) => elements.forEach((element) => element.classList.add('visual-dynamic-text')));
  await expectInterfaceScreenshot(page, 'results-archive-mobile.png');
});
