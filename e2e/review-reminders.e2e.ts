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
    const invitations = page.getByRole('region', { name: 'Доступные обзоры' });
    const week = invitations.getByRole('link', { name: /Вспомнить неделю/ });
    const month = invitations.getByRole('link', { name: /Вспомнить месяц/ });
    await expect(week).toBeVisible();
    await expect(month).toBeVisible();
    const overview = page.getByRole('navigation', { name: 'Основная навигация' }).getByRole('link', { name: 'Обзоры', exact: true });
    await expect(overview).toHaveAttribute('href', '/week');
    await expectPageFitsViewport(page);
    await page.screenshot({ path: testInfo.outputPath(`today-reminder-${width}.png`), animations: 'disabled' });
    await week.click();
    await expect(page).toHaveURL(/\/week\?week=2026-10-26#week-review$/);
    await expect(page.getByRole('heading', { name: 'Короткий обзор' })).toBeInViewport();
    await page.getByRole('link', { name: 'Сегодня', exact: true }).click();
    await expect(week).toBeVisible();
    await invitations.getByRole('button', { name: /Скрыть.*Вспомнить неделю/ }).click();
    await expect(week).toHaveCount(0);
    await expect(month).toBeVisible();
    await page.reload();
    await expect(month).toBeVisible();
    await expect(week).toHaveCount(0);
    await month.click();
    await expect(page).toHaveURL(/\/month\?month=2026-10-01#month-review$/);
    await expect(page.getByRole('heading', { name: 'Обзор месяца' })).toBeInViewport();
    await page.getByPlaceholder('Что стоит продолжить, изменить или проверить').fill('Выбрать один следующий шаг');
    await page.getByRole('button', { name: 'Сохранить обзор месяца' }).click();
    await expect(page.getByText('Итог месяца сохранён', { exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'Сегодня', exact: true }).click();
    await expect(invitations).toHaveCount(0);
    await page.reload();
    await expect(invitations).toHaveCount(0);
    await expectPageFitsViewport(page);
  });
}

test('shows the latest available period across rollover and switches to the next window on resume', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-16T12:00:00Z'));
  await importJournal(page, '2026-10-16');
  await page.goto('/today');
  await expect(page.locator('.page--today')).toBeVisible();
  const week = page.getByRole('link', { name: /Вспомнить неделю/ });
  await expect(week).toHaveCount(0);
  await page.clock.setFixedTime(new Date('2026-10-17T12:00:00Z'));
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(week).toHaveAttribute('href', '/week?week=2026-10-12#week-review');
  await page.clock.setFixedTime(new Date('2026-10-19T12:00:00Z'));
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(week).toHaveAttribute('href', '/week?week=2026-10-12#week-review');
  await page.clock.setFixedTime(new Date('2026-10-24T12:00:00Z'));
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(week).toHaveCount(0);
});

test('opens the selected review on resume when its window begins', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-16T12:00:00Z'));
  await importJournal(page, '2026-10-16');
  await page.goto('/week?week=2026-10-12');
  await expect(page.getByRole('heading', { name: 'Короткий обзор' })).toHaveCount(0);
  await page.clock.setFixedTime(new Date('2026-10-17T12:00:00Z'));
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByRole('heading', { name: 'Короткий обзор' })).toBeVisible();
});
