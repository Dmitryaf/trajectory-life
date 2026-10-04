import { expect, test, type Page } from './fixtures';
import { resolve } from 'node:path';
import { visualDemoAnchor, visualDemoFilePath, emptyPeriodDate } from './demo-data';

const visualStylePath = resolve(process.cwd(), 'e2e/visual-regression.css');

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date(`${visualDemoAnchor}T12:00:00.000Z`));
  await page.goto('/settings');
  await page.locator('input[type="file"]').setInputFiles(visualDemoFilePath);
  await expect(page.locator('input[type="file"]')).toHaveValue('');
  await page.goto('/today');
  await page.locator('.page--today').waitFor();
  await page.evaluate(() => document.fonts.ready);
});

async function expectTodayScreenshot(page: Page, name: string) {
  const platformSnapshotName = name.replace(/\.png$/, `-${process.platform}.png`);
  await expect.soft(page).toHaveScreenshot(platformSnapshotName, {
    animations: 'disabled',
    caret: 'hide',
    maxDiffPixelRatio: 0.03,
    stylePath: visualStylePath,
  });
}

async function stabilizeTodayScreenshot(page: Page) {
  await page.locator('.entry-date-control__trigger > span').evaluate((date) => date.classList.add('visual-dynamic-text'));
  await page
    .locator('.review-nudge, .recovery-nudge, .today-pulse')
    .evaluateAll((sections) => sections.forEach((section) => section.classList.add('visual-calendar-dependent')));
}

test('keeps Today visually stable across its critical states', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/today');
  await page.locator('.page--today').waitFor();
  await stabilizeTodayScreenshot(page);
  await expectTodayScreenshot(page, 'today-mobile-with-goal.png');

  await page.getByRole('button', { name: 'Изменить' }).click();
  await page.getByRole('button', { name: 'Убрать цель' }).click();
  await expect(page.getByLabel('Текущая цель')).toContainText('Цель на эту дату: Подготовить короткий доклад');
  await expect(page.getByRole('button', { name: 'Выбрать новую' })).toBeVisible();
  await expectTodayScreenshot(page, 'today-mobile-without-goal.png');

  await page.setViewportSize({ width: 768, height: 1024 });
  await page.getByLabel('Дата записи').fill(emptyPeriodDate(visualDemoFilePath));
  await page.locator('.page--today > .page-heading h1').evaluate((heading) => heading.classList.add('visual-dynamic-text'));
  await page.getByPlaceholder('Например: после прогулки стало легче собраться с мыслями').fill('Проверка новой записи на планшете');
  await expect(page.getByText('Черновик сохранён на этом устройстве', { exact: false })).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await expectTodayScreenshot(page, 'today-tablet-new-dirty-entry.png');

  await page.setViewportSize({ width: 1280, height: 720 });
  await page.locator('.form-card--daily-summary').scrollIntoViewIfNeeded();
  await expectTodayScreenshot(page, 'today-desktop-daily-summary.png');
});
