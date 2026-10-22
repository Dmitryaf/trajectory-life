import { expect, test } from './fixtures';

test.use({ allowedBrowserErrors: [/Failed to load resource/] });

test('keeps a recovery screen when the application module fails and retries the same route', async ({ page }) => {
  let unavailable = true;
  await page.route('**/src/main.ts', async (route) => {
    if (unavailable) {
      await route.abort('failed');
    } else {
      await route.continue();
    }
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/today');
  await expect(page.getByRole('status')).toContainText('Не удалось загрузить приложение');
  await expect(page.getByRole('heading', { name: 'Открываем дневник' })).toBeVisible();
  unavailable = false;
  await page.getByRole('link', { name: 'Обновить страницу', exact: true }).click();
  await expect(page).toHaveURL(/\/today$/);
  await expect(page.locator('.app-shell')).toBeVisible();
  await expect(page.locator('.startup-screen')).toHaveCount(0);
});
