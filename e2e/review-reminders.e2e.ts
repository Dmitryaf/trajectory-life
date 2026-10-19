import { expect, test, type Page } from './fixtures';
import { readDemoPayload, visualDemoFilePath } from './demo-data';
import { expectPageFitsViewport } from './layout-assertions';

async function importJournal(page: Page, date: string) {
  const payload = readDemoPayload(visualDemoFilePath);
  payload.dailyEntries = [];
  payload.weeklyReviews = [];
  payload.monthlyReviews = [];
  payload.results = [
    { date, area: 'career', title: 'Закончил небольшой проект', note: 'Синтетическая запись для проверки', createdAt: `${date}T12:00:00Z` },
  ];
  payload.lifeEvents = [];
  await page.goto('/settings');
  await page
    .locator('input[type="file"]')
    .setInputFiles({ name: 'journal.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(payload)) });
  await expect(page.locator('input[type="file"]')).toHaveValue('');
}

for (const width of [320, 390, 1440]) {
  test(`reminds about journal-only week and month without requiring a saved reflection at ${width}px`, async ({ page }, testInfo) => {
    await page.clock.setFixedTime(new Date('2026-10-31T12:00:00Z'));
    await page.setViewportSize({ width, height: 844 });
    await importJournal(page, '2026-10-30');
    await page.goto('/today');
    const badge = page.locator('.bottom-nav .review-reminder-dot');
    await expect(badge).toHaveAttribute('aria-label', 'Можно вспомнить неделю. Можно вспомнить месяц');
    const overview = page.getByRole('navigation', { name: 'Основная навигация' }).getByRole('link', { name: 'Обзор', exact: true });
    await expect(overview).toHaveAccessibleDescription('Можно вспомнить неделю. Можно вспомнить месяц');
    await expectPageFitsViewport(page);
    await page.screenshot({ path: testInfo.outputPath(`today-reminder-${width}.png`) });
    await page.goto('/week?week=2026-10-19');
    await expect(page.locator('.page--week')).toBeVisible();
    await expect(badge).toHaveAttribute('aria-label', 'Можно вспомнить неделю. Можно вспомнить месяц');
    await page.locator('.bottom-nav__item[href="/week"]').click();
    await expect(page.locator('.page--week')).toBeVisible();
    await expect(badge).toHaveAttribute('aria-label', 'Можно вспомнить месяц');
    await expect(page.locator('.review-period-navigation a[href="/month"] .review-reminder-dot')).toBeVisible();
    await page.reload();
    await expect(badge).toHaveAttribute('aria-label', 'Можно вспомнить месяц');
    await page.locator('.bottom-nav__item[href="/month"]').click();
    await expect(page.locator('.page--month')).toBeVisible();
    await expect(badge).toHaveCount(0);
    await page.goto('/today');
    await expect(page.locator('.page--today')).toBeVisible();
    await expect(badge).toHaveCount(0);
    await page.reload();
    await expect(page.locator('.page--today')).toBeVisible();
    await expect(badge).toHaveCount(0);
    await expectPageFitsViewport(page);
  });
}

test('does not show an overdue badge and opens the next review window on resume', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-16T12:00:00Z'));
  await importJournal(page, '2026-10-16');
  await page.goto('/today');
  await expect(page.locator('.page--today')).toBeVisible();
  const badge = page.locator('.bottom-nav .review-reminder-dot');
  await expect(badge).toHaveCount(0);
  await page.clock.setFixedTime(new Date('2026-10-17T12:00:00Z'));
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(badge).toHaveAttribute('aria-label', 'Можно вспомнить неделю');
  await page.clock.setFixedTime(new Date('2026-10-19T12:00:00Z'));
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(badge).toHaveCount(0);
});
