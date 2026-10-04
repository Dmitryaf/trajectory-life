import { expect, test } from './fixtures';

test.use({ allowedBrowserErrors: [/console\.error: Не удалось подготовить записи/] });

test('shows a recoverable screen when IndexedDB fails during startup', async ({ page }) => {
  await page.addInitScript(() => {
    const request = indexedDB.open('trajectory', 100);
    request.onsuccess = () => request.result.close();
  });

  await page.goto('/today');
  const storageError = page.getByRole('alert');
  await expect(storageError).toContainText('Локальное хранилище недоступно');
  await expect(storageError).toContainText('Записи пока не открылись');
  await expect(storageError.getByRole('button', { name: 'Повторить' })).toBeVisible();
  await expect(page.locator('.bottom-nav')).toBeHidden();

  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase('trajectory');
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('Тестовая база осталась заблокирована'));
    });
  });
  await storageError.getByRole('button', { name: 'Повторить' }).click();
  await expect(page.locator('.page--today')).toBeVisible();
  await expect(page.locator('.bottom-nav')).toBeVisible();
});
