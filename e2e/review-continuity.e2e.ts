import { expect, test } from './fixtures';
import { readDemoPayload, visualDemoFilePath } from './demo-data';
import { expectPageFitsViewport } from './layout-assertions';
import { emptyMonthlyReview, emptyWeeklyReview } from '../src/model/reviews';

for (const width of [390, 1440]) {
  test(`returns weekly reflections to the month at ${width}px`, async ({ page }, testInfo) => {
    await page.clock.setFixedTime(new Date('2026-08-30T12:00:00.000Z'));
    await page.setViewportSize({ width, height: 900 });
    const payload = readDemoPayload(visualDemoFilePath);
    payload.dailyEntries = [];
    payload.results = [];
    payload.lifeEvents = [];
    payload.monthlyReviews = [];
    payload.weeklyReviews = [
      { ...emptyWeeklyReview('2026-07-27'), support: 'Помогла встреча с друзьями' },
      {
        ...emptyWeeklyReview('2026-08-17'),
        nextLever: 'Оставить больше свободного времени',
        previousPlanOutcome: 'Удалось отдохнуть. ' + 'Важная подробность недели. '.repeat(30),
        support: 'Встречи с друзьями',
        obstacle: 'Позднее завершение работы',
        stateContext: 'Неделя с поездкой и непривычным расписанием',
        ifThenPlan: 'Если устану, оставлю вечер свободным',
        highlights: ['Разговор, который хотелось запомнить', 'Прогулка после поездки'],
        results: ['Закончил книгу', 'Разобрал фотографии', 'Вернулся к плаванию'],
      },
    ];
    await page.goto('/settings');
    await page
      .locator('input[type="file"]')
      .setInputFiles({ name: 'reflections.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(payload)) });
    await expect(page.locator('input[type="file"]')).toHaveValue('');
    await page.goto('/month');
    const weeks = page.locator('.month-week-reviews');
    await expect(weeks.getByRole('heading', { name: 'Что вы заметили за недели' })).toBeVisible();
    await expect(weeks.locator('article')).toHaveCount(2);
    await expect(weeks).not.toContainText('Можно оставить всё как есть.');
    await expect(weeks.getByText('Обзор всей недели, включая дни соседнего месяца.')).toBeVisible();
    await weeks.scrollIntoViewIfNeeded();
    await weeks.screenshot({ path: testInfo.outputPath('weekly-reflections-collapsed.png'), animations: 'disabled' });
    const details = weeks.locator('details');
    await details.locator('summary').focus();
    await page.keyboard.press('Enter');
    await expect(details.getByText('Проверка прежнего решения')).toBeVisible();
    await expect(details.getByRole('heading', { name: 'Итоги', exact: true })).toHaveCount(1);
    await expect(details.getByRole('heading', { name: 'Важное за неделю', exact: true })).toHaveCount(1);
    await expect(details.locator('li')).toHaveCount(10);
    await weeks.screenshot({ path: testInfo.outputPath('weekly-reflections-details.png'), animations: 'disabled' });
    await expect(details.getByRole('button', { name: 'Показать полностью' })).toBeVisible();
    await details.getByRole('button', { name: 'Показать полностью' }).click();
    await expectPageFitsViewport(page);
    await weeks.scrollIntoViewIfNeeded();
    await weeks.screenshot({ path: testInfo.outputPath('weekly-reflections.png'), animations: 'disabled' });
    await details.locator('summary').focus();
    await page.keyboard.press('Enter');
    await expect(details).not.toHaveAttribute('open', '');
    await weeks.locator('a[href="/week?week=2026-08-17#week-review"]').click();
    await expect(page).toHaveURL(/week\?week=2026-08-17#week-review/);
    await expect(page.getByPlaceholder('Можно продолжить как есть или пока ничего не решать')).toHaveValue(
      'Оставить больше свободного времени',
    );
    await expectPageFitsViewport(page);
  });
}

test('carries the outgoing Sunday plan into Monday and supports a text-only review', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-08-23T12:00:00.000Z'));
  const payload = readDemoPayload(visualDemoFilePath);
  payload.dailyEntries = [{ date: '2026-08-23', importantFact: 'Запомнился разговор' }];
  payload.results = [];
  payload.lifeEvents = [];
  payload.weeklyReviews = [];
  payload.monthlyReviews = [];
  await page.goto('/settings');
  await page
    .locator('input[type="file"]')
    .setInputFiles({ name: 'text-diary.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(payload)) });
  await expect(page.locator('input[type="file"]')).toHaveValue('');
  await page.goto('/today');
  await page.getByRole('link', { name: /Вспомнить неделю/ }).click();
  await expect(page).toHaveURL(/week\?week=2026-08-17/);
  await expect(page.locator('.review-cue')).toHaveCount(0);
  await expect(page.locator('.review-cue-empty')).toContainText('измерения для этого не нужны');
  await page.getByPlaceholder('Например: если не могу начать, то выделю 10 минут на черновик').fill('Если устану, выйду на прогулку');
  await page.getByRole('button', { name: 'Сохранить обзор', exact: true }).click();
  await expect(page.getByText('Обзор недели сохранён', { exact: true })).toBeVisible();
  await page.clock.setFixedTime(new Date('2026-08-24T12:00:00.000Z'));
  await page.goto('/today');
  await expect(page.getByRole('link', { name: /Вспомнить неделю/ })).toHaveCount(0);
  const plan = page.getByRole('region', { name: 'Текущий план недели' });
  await expect(plan).toContainText('Если устану, выйду на прогулку');
  await expect(plan).toContainText('24 авг.');
  await plan.getByRole('link', { name: 'Из обзора прошлой недели' }).click();
  await expect(page).toHaveURL(/week\?week=2026-08-17#week-review/);
});
test('keeps a boundary week, its monthly focus and its draft across scale changes, Back and reload', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-14T12:00:00Z'));
  const payload = {
    ...readDemoPayload(visualDemoFilePath),
    monthlyReviews: [{ ...emptyMonthlyReview('2026-10-01'), nextFocus: 'Гулять в ноябре' }],
    weeklyReviews: [{ ...emptyWeeklyReview('2026-10-26'), support: 'Прогулки на воздухе' }],
  };
  await page.goto('/settings');
  await page
    .locator('input[type="file"]')
    .setInputFiles({ name: 'periods.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(payload)) });
  await expect(page.locator('input[type="file"]')).toHaveValue('');
  await page.goto('/month?month=2026-11-01');
  await page.locator('.month-week-reviews a').first().click();
  await expect(page).toHaveURL(/week\?week=2026-11-01#week-review$/);
  const decision = page.getByLabel('Что продолжить или изменить на следующей неделе?');
  await expect(page.getByText('Гулять в ноябре', { exact: true })).toBeVisible();
  await page.getByText('Что продолжить или изменить на следующей неделе?', { exact: true }).click();
  await expect(decision).toBeFocused();
  await decision.fill('Проверить один новый маршрут');
  const tabs = page.getByRole('navigation', { name: 'Период обзора' });
  await tabs.getByRole('link', { name: 'Месяц' }).click();
  await expect(page).toHaveURL(/month\?month=2026-11-01$/);
  await page.goBack();
  await expect(decision).toHaveValue('Проверить один новый маршрут');
  await page.getByLabel('Предыдущий период').click();
  await expect(page).toHaveURL(/week\?week=2026-10-25$/);
  await page.reload();
  await expect(decision).toBeEmpty();
  await page.goBack();
  await expect(decision).toHaveValue('Проверить один новый маршрут');
  await page.getByRole('button', { name: 'К текущей неделе' }).click();
  await expect(page).toHaveURL(/week\?week=2026-11-14$/);
});
