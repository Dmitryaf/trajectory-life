import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from './fixtures';
import { demoFilePath, readDemoPayload } from './demo-data';

test.use({ confirmBackupImports: false });

async function downloadBackup(page: Page) {
  const downloadReady = page.waitForEvent('download');
  await page
    .locator('#backup-settings')
    .getByRole('button', { name: /Скачать/ })
    .click();
  const download = await downloadReady;
  return JSON.parse(await readFile((await download.path())!, 'utf8')) as ReturnType<typeof readDemoPayload>;
}

test('preserves existing records on cancel and replaces them only after explicit backup confirmation', async ({ page }) => {
  await page.goto('/settings');
  const fileInput = page.locator('input[type="file"]');
  page.once('dialog', async (dialog) => {
    await dialog.accept();
  });
  await fileInput.setInputFiles(demoFilePath);
  await expect(page.getByText('Резервная копия восстановлена на этом устройстве', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Данные и синхронизация', exact: true }).click();
  const baseline = await downloadBackup(page);
  const replacement = {
    ...baseline,
    dailyEntries: [{ ...baseline.dailyEntries[0]!, importantFact: 'Подтверждённая замена' }],
    results: [],
  };
  const file = { name: 'replacement.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(replacement)) };

  let warning = '';
  page.once('dialog', async (dialog) => {
    warning = dialog.message();
    await dialog.dismiss();
  });
  await fileInput.setInputFiles(file);
  await expect(fileInput).toHaveValue('');
  expect(warning).toContain('будут заменены, а не объединены');
  const canceled = await downloadBackup(page);
  expect(canceled.dailyEntries).toEqual(baseline.dailyEntries);
  expect(canceled.results).toEqual(baseline.results);
  expect(canceled.settings).toEqual(baseline.settings);

  page.once('dialog', async (dialog) => {
    await dialog.accept();
  });
  await fileInput.setInputFiles(file);
  await expect(fileInput).toHaveValue('');
  const restored = await downloadBackup(page);
  expect(restored.dailyEntries).toEqual(replacement.dailyEntries);
  expect(restored.results).toEqual([]);
});
