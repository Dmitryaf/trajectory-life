import { expect, test } from './fixtures';

test('requests persistent storage after a meaningful mobile action and reports a denial honestly', async ({ page }) => {
  await page.addInitScript(() => {
    const calls = { persisted: 0, persist: 0 };
    Object.defineProperty(globalThis, '__trajectoryStorageCalls', { value: calls, configurable: true });
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: {
        persisted: async () => {
          calls.persisted += 1;
          return false;
        },
        persist: async () => {
          calls.persist += 1;
          return false;
        },
      },
    });
  });

  await page.goto('/today');
  const introClose = page.getByRole('button', { name: 'Закрыть объяснение' });
  if (await introClose.isVisible()) {
    await introClose.click();
  }
  await page.getByRole('button', { name: 'Начать с сегодняшнего дня' }).click();

  await page.getByRole('button', { name: 'Выбрать цель' }).first().click();
  await page.getByLabel('Что хотите изменить или закончить').fill('Проверить сохранность записей');
  await page.getByLabel('Как понять, что получилось').fill('Запись остаётся после перезапуска');
  await page.getByLabel('Что считать шагом к цели').fill('Сохранённый день');
  await page.getByRole('button', { name: 'Сохранить цель' }).click();

  await expect
    .poll(() =>
      page.evaluate(() => {
        const calls = (globalThis as typeof globalThis & { __trajectoryStorageCalls: { persisted: number; persist: number } })
          .__trajectoryStorageCalls;
        return calls.persist;
      }),
    )
    .toBe(1);

  await page.goto('/settings#data-settings');
  await expect(page.getByText('Локальное хранилище работает без дополнительной защиты')).toBeVisible();
  await expect(page.getByText('Используйте облачную копию и периодически скачивайте JSON.', { exact: false })).toBeVisible();
});
