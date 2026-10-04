import { expect, test } from './fixtures';
import { buildRepeatedUsePayload } from './demo-data';

test('offers the browser install action and keeps the iOS fallback in one guide', async ({ page }) => {
  await page.goto('/settings#install-settings');
  await page.locator('.page--settings').waitFor();
  const mobilePlatform = await page.evaluate(() => /iphone|ipad|ipod|android/i.test(navigator.userAgent));
  const guide = page.locator('#install-settings');
  if (!mobilePlatform) {
    await expect(guide).toBeHidden();
    await expect(page.getByText('Установить на телефон')).toBeHidden();
    return;
  }
  await guide.waitFor({ state: 'attached' });
  await page.evaluate(() => {
    Object.defineProperty(globalThis, '__trajectoryInstallPromptCalls', { value: 0, writable: true, configurable: true });
    const event = new Event('beforeinstallprompt', { cancelable: true });
    Object.defineProperties(event, {
      prompt: {
        value: async () => {
          (globalThis as typeof globalThis & { __trajectoryInstallPromptCalls: number }).__trajectoryInstallPromptCalls += 1;
        },
      },
      userChoice: { value: Promise.resolve({ outcome: 'accepted' }) },
    });
    window.dispatchEvent(event);
  });

  await expect(guide.getByRole('heading', { name: 'Установка на телефон' })).toBeVisible();
  await expect(guide.getByRole('heading', { name: 'Android' })).toBeVisible();
  await expect(guide.getByRole('heading', { name: 'iPhone и iPad' })).toBeVisible();
  await expect(guide.getByText('Откройте сайт в Safari.')).toBeVisible();
  await guide.getByRole('button', { name: 'Установить через браузер' }).click();
  await expect
    .poll(() =>
      page.evaluate(() => (globalThis as typeof globalThis & { __trajectoryInstallPromptCalls: number }).__trajectoryInstallPromptCalls),
    )
    .toBe(1);

  await page.evaluate(() => window.dispatchEvent(new Event('appinstalled')));
  await expect(guide.getByText('Открыто с домашнего экрана')).toBeVisible();
});

test('suggests installation after repeated use and respects Later', async ({ page }) => {
  await page.goto('/settings');
  const mobilePlatform = await page.evaluate(() => /iphone|ipad|ipod|android/i.test(navigator.userAgent));
  const today = await page.evaluate(() => {
    const date = new Date();
    return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
  });
  await page.locator('input[type="file"]').setInputFiles({
    name: 'trajectory-repeated-use.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(buildRepeatedUsePayload(today))),
  });
  await expect(page.locator('input[type="file"]')).toHaveValue('');
  await page.goto('/today');
  await page.evaluate(() => {
    const event = new Event('beforeinstallprompt', { cancelable: true });
    Object.defineProperties(event, {
      prompt: { value: async () => undefined },
      userChoice: { value: Promise.resolve({ outcome: 'dismissed' }) },
    });
    window.dispatchEvent(event);
  });
  const suggestion = page.getByLabel('Установка приложения');
  if (!mobilePlatform) {
    await expect(suggestion).toBeHidden();
    return;
  }
  await expect(page.getByLabel('Период готов к обзору')).toBeHidden();
  await expect(page.getByLabel('Вчера без записи')).toBeHidden();
  await expect(suggestion).toBeVisible();
  await expect(suggestion).toContainText('Открывайте «Траекторию» без браузера');
  await suggestion.getByRole('button', { name: 'Позже' }).click();
  await expect(suggestion).toBeHidden();

  await page.reload();
  await expect(suggestion).toBeHidden();
});
