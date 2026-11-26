import { expect, test } from './fixtures';
import { readDemoPayload, visualDemoFilePath } from './demo-data';

test('saves only the settings card named on the button and keeps the other edit available', async ({ page }) => {
  await page.goto('/settings');
  const criterion = page.locator('#nutrition-criterion');
  await criterion.fill('Синтетический критерий');
  const lifeArea = page.locator('#life-areas').getByRole('button', { name: /Семья/ });
  const original = await lifeArea.getAttribute('aria-pressed');
  await lifeArea.click();
  await page.getByRole('button', { name: 'Сохранить области' }).click();
  await expect(page.getByText('Области сохранены', { exact: true })).toBeVisible();
  await expect(criterion).toHaveValue('Синтетический критерий');
  await page.reload();
  await expect(lifeArea).toHaveAttribute('aria-pressed', original === 'true' ? 'false' : 'true');
  await expect(criterion).toHaveValue('');
});

test('links observations to their original month and keeps export inside a populated period', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-14T12:00:00Z'));
  await page.goto('/trends');
  await expect(page.getByRole('heading', { name: 'Динамика', exact: true })).toBeVisible();
  await expect(page.getByText('За этот период пока нет записей')).toBeVisible();
  await expect(page.locator('.period-analysis-card')).toHaveCount(0);
  const demo = readDemoPayload();
  const updatedAt = '2026-11-13T12:00:00Z';
  const month = {
    monthStart: '2026-04-01',
    mainPattern: 'Наблюдение без решения',
    support: '',
    obstacle: '',
    courseChange: '',
    nextFocus: '',
    ifThenPlan: '',
    updatedAt,
  };
  await page.goto('/settings');
  await page.locator('input[type="file"]').setInputFiles({
    name: 'reviews.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        ...demo,
        dailyEntries: [],
        lifeEvents: [],
        results: [],
        weeklyReviews: [],
        monthlyReviews: [month],
        settings: { ...demo.settings, experimentHistory: [] },
      }),
    ),
  });
  await expect(page.getByText('Резервная копия восстановлена на этом устройстве', { exact: true })).toBeVisible();
  await page.goto('/trends');
  await expect(page.getByText('За этот период пока нет записей')).toBeVisible();
  await page.getByRole('button', { name: '12 месяцев' }).click();
  const row = page.locator('.history-timeline__item--observation');
  await expect(row).toContainText('Наблюдение месяца');
  await expect(row).toContainText('Обновлено');
  await expect(page.locator('.history-timeline__item--decision')).toHaveCount(0);
  await expect(page.locator('.period-analysis-card__external')).not.toHaveAttribute('open', '');
  await row.getByRole('link', { name: month.mainPattern }).click();
  await expect(page).toHaveURL(/\/month\?month=2026-04-01#month-review$/);
});

test('opens the archived experiment and its week even outside the longest comparison range', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2028-09-20T12:00:00Z'));
  const demo = readDemoPayload(visualDemoFilePath);
  const [experiment] = demo.settings.experimentHistory as [{ id: string; title: string }];
  await page.goto('/settings');
  await page.locator('input[type="file"]').setInputFiles(visualDemoFilePath);
  await expect(page.getByText('Резервная копия восстановлена на этом устройстве', { exact: true })).toBeVisible();
  await page.goto('/trends');
  await page.getByRole('link', { name: 'Все завершённые эксперименты' }).click();
  await expect(page).toHaveURL(/\/trends#experiments$/);
  await expect(page.getByRole('heading', { name: 'Завершённые эксперименты' })).toBeVisible();
  const link = page.getByRole('link', { name: experiment.title, exact: true });
  await expect(link).toBeVisible();
  await page.goto(`/trends#experiment-${experiment.id}`);
  await link.click();
  await expect(page.locator('.week-data-details')).toHaveAttribute('open', '');
  const record = page.locator('.experiment-period-card').filter({ hasText: experiment.title });
  await expect(record).toHaveAttribute('open', '');
});
