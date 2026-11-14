import { expect, test, type Page } from './fixtures';
import { readDemoPayload } from './demo-data';
import { expectPageFitsViewport } from './layout-assertions';

async function seed(page: Page, entries: Array<{ date: string; importantFact?: string }> = []) {
  const payload = { ...readDemoPayload(), dailyEntries: entries, results: [], lifeEvents: [], weeklyReviews: [], monthlyReviews: [] };
  await page.clock.setFixedTime(new Date('2026-11-14T12:00:00Z'));
  await page.goto('/settings');
  await page
    .locator('input[type="file"]')
    .setInputFiles({ name: 'synthetic-journal.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(payload)) });
  await expect(page.locator('input[type="file"]')).toHaveValue('');
}

async function records(page: Page, table: string) {
  return page.evaluate(
    (name) =>
      new Promise<Array<Record<string, unknown>>>((resolve, reject) => {
        const open = indexedDB.open('trajectory');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const request = db.transaction(name).objectStore(name).getAll();
          request.onsuccess = () => {
            resolve(request.result);
            db.close();
          };
          request.onerror = () => {
            reject(request.error);
            db.close();
          };
        };
      }),
    table,
  );
}

for (const [route, other, table, saved] of [
  ['results', 'events', 'results', 'Итог добавлен'],
  ['events', 'results', 'lifeEvents', 'Событие добавлено'],
] as const) {
  test(`protects a text-only ${route} draft across navigation and reload, then clears it atomically`, async ({ page }) => {
    await seed(page, [{ date: '2026-11-12', importantFact: 'Предыдущая дневная запись' }]);
    await page.goto('/today');
    await page.locator(`.quick-capture a[href="/${route}?create=1"]`).click();
    await expect(page.locator('.archive-add')).toHaveAttribute('open', '');
    const note = page.locator('.archive-composer textarea');
    await note.fill('Текст без отдельного названия. '.repeat(12));
    await page.locator(`.archive-navigation a[href="/${other}"]`).click();
    await page.locator(`.archive-navigation a[href="/${route}"]`).click();
    await expect(note).toHaveValue('Текст без отдельного названия. '.repeat(12));
    await expect(page.getByText(/Восстановлен черновик/)).toBeVisible();
    await page.reload();
    await expect(note).toHaveValue('Текст без отдельного названия. '.repeat(12));
    await expect.poll(() => records(page, table)).toEqual([]);
    await note.focus();
    await page.keyboard.press('Tab');
    await expect(page.locator('.archive-composer .primary-button')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByText(saved, { exact: true })).toBeVisible();
    const contrast = await page
      .locator('[data-sonner-toast][data-type="success"]')
      .last()
      .evaluate((element) => {
        const style = getComputedStyle(element);
        const luminance = (color: string) =>
          color
            .match(/[\d.]+/g)!
            .slice(0, 3)
            .map(Number)
            .map((n) => {
              const v = n / 255;
              return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
            })
            .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i]!, 0);
        const values = [luminance(style.color), luminance(style.backgroundColor)].sort((a, b) => b - a);
        return (values[0]! + 0.05) / (values[1]! + 0.05);
      });
    expect(contrast).toBeGreaterThanOrEqual(4.5);
    const stored = await records(page, table);
    expect(stored).toHaveLength(1);
    expect(stored[0]!.note).toBe('Текст без отдельного названия. '.repeat(12).trim());
    expect(String(stored[0]!.title).length).toBeLessThanOrEqual(route === 'results' ? 160 : 140);
    expect(await records(page, 'editorDrafts')).toEqual([]);
    await page.reload();
    await expect(page.locator('.archive-add')).not.toHaveAttribute('open', '');
    await expect(page.getByText(/Восстановлен черновик/)).toHaveCount(0);
    // The quick action must open an editor even after the archive has records.
    await page.goto('/today');
    await page.locator(`.quick-capture a[href="/${route}?create=1"]`).click();
    await expect(note).toBeVisible();
  });
}

test('keeps separate edit drafts and requires an explicit choice before replacing a newer record', async ({ page }) => {
  await seed(page);
  await page.goto('/results?create=1');
  const note = page.locator('.archive-composer textarea');
  for (const text of ['Первая запись', 'Вторая запись']) {
    await note.fill(text);
    await page.getByRole('button', { name: 'Добавить итог', exact: true }).click();
    await expect(note).toHaveValue('');
  }
  const first = page.locator('.result-item').filter({ hasText: 'Первая запись' });
  const second = page.locator('.result-item').filter({ hasText: 'Вторая запись' });
  await first.getByLabel('Редактировать итог').click();
  await note.fill('Черновик первой записи');
  await second.getByLabel('Редактировать итог').click();
  await note.fill('Черновик второй записи');
  await page.locator('.journal-drafts > summary').click();
  await page.locator('.journal-drafts').getByRole('button', { name: 'Первая запись', exact: true }).click();
  await expect(note).toHaveValue('Черновик первой записи');
  const firstRecord = (await records(page, 'results')).find((item) => item.title === 'Первая запись')!;
  await page.evaluate(
    (record) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('trajectory');
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction('results', 'readwrite');
          tx.objectStore('results').put({ ...record, note: 'Более свежая версия' });
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => {
            db.close();
            reject(tx.error);
          };
        };
      }),
    firstRecord,
  );
  await page.getByRole('button', { name: 'Сохранить итог', exact: true }).click();
  await expect(page.locator('.journal-conflict')).toBeVisible();
  expect((await records(page, 'results')).find((item) => item.id === firstRecord.id)?.note).toBe('Более свежая версия');
  await page.getByRole('button', { name: 'Сохранить мой вариант' }).click();
  await expect(page.locator('.journal-conflict')).toHaveCount(0);
  expect((await records(page, 'results')).find((item) => item.id === firstRecord.id)?.note).toBe('Черновик первой записи');
  expect(await records(page, 'editorDrafts')).toHaveLength(1);
  await page.goto('/results');
  await expect(note).toHaveValue('Черновик второй записи');
  await page.reload();
  await expect(note).toHaveValue('Черновик второй записи');
});

for (const period of ['week', 'month'] as const) {
  test(`restores and saves an empty completed ${period} review without inventing daily records`, async ({ page }) => {
    await seed(page, []);
    await page.goto(`/${period}`);
    await page.getByLabel('Предыдущий период').click();
    const field = page.getByPlaceholder(
      period === 'week' ? 'Можно продолжить как есть или пока ничего не решать' : 'Что стоит продолжить, изменить или проверить',
    );
    await expect(field).toBeVisible();
    await page.screenshot({ path: `qa/drafts-20261114/empty-${period}.png`, fullPage: true, animations: 'disabled' });
    await field.fill(`Вспомнил ${period} без ежедневных отметок`);
    await page.getByLabel('Следующий период').click();
    await page.getByLabel('Предыдущий период').click();
    await expect(field).toHaveValue(`Вспомнил ${period} без ежедневных отметок`);
    await page.reload();
    await page.getByLabel('Предыдущий период').click();
    await expect(field).toHaveValue(`Вспомнил ${period} без ежедневных отметок`);
    await page.getByRole('button', { name: period === 'week' ? 'Сохранить обзор' : 'Сохранить обзор месяца', exact: true }).click();
    await expect(page.getByText(period === 'week' ? 'Обзор недели сохранён' : 'Итог месяца сохранён', { exact: true })).toBeVisible();
    expect(await records(page, 'dailyEntries')).toEqual([]);
    expect(await records(page, period === 'week' ? 'weeklyReviews' : 'monthlyReviews')).toHaveLength(1);
    expect(await records(page, 'editorDrafts')).toEqual([]);
    if (period === 'week') {
      await page.goto('/month');
      await expect(page.locator('.month-week-reviews')).toContainText('Вспомнил week без ежедневных отметок');
      await page.locator('.month-week-reviews a').click();
      await expect(field).toHaveValue('Вспомнил week без ежедневных отметок');
    }
  });
}

test('shows text-only monthly memories, opens their source dates and restores daily drafts', async ({ page }) => {
  const text = 'Важный разговор, который хочется запомнить. '.repeat(30).trim();
  await seed(page, [{ date: '2026-11-12', importantFact: text }]);
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/month');
    const card = page.locator('.month-daily-notes');
    await expect(card).toContainText(text);
    await card.getByRole('button', { name: 'Показать полностью' }).click();
    await expectPageFitsViewport(page, `monthly text at ${width}`);
    await page.screenshot({ path: `qa/drafts-20261114/month-notes-${width}.png`, fullPage: true, animations: 'disabled' });
    await card.getByRole('link').click();
    await expect(page.getByLabel('Дата записи', { exact: true })).toHaveValue('2026-11-12');
    await expect(page.getByLabel('Заметка дня')).toHaveValue(width === 390 ? text : 'Черновик дневной заметки');
    await page.getByLabel('Заметка дня').fill('Черновик дневной заметки');
    await expect(page.getByText(/Черновик сохранён на этом устройстве|Восстановлены несохранённые изменения/)).toBeVisible();
  }
  for (const date of ['2026-02-30', '2099-01-01', 'bad']) {
    await page.goto(`/today?date=${date}`);
    await expect(page.getByLabel('Дата записи', { exact: true })).toHaveValue('2026-11-14');
  }
});
