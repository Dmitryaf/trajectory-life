import { expect } from '@playwright/test';

const titleField = 'Что вы сделали или какой результат получили';
const noteField = 'Что произошло, почему это важно или какой контекст стоит сохранить';

export async function open(client, path) {
  await client.page.goto(client.origin + path, { waitUntil: 'domcontentloaded' });
  await expect(client.page.locator('h1').first()).toBeVisible({ timeout: 30_000 });
}

export async function addResult(client, title, note, date) {
  const { page } = client;
  await open(client, '/results');
  await page.getByPlaceholder(titleField).fill(title);
  await page.getByPlaceholder(noteField).fill(note);
  if (date) {
    await page.getByLabel('Дата итога', { exact: true }).fill(date);
  }
  await page.getByRole('button', { name: 'Добавить итог', exact: true }).click();
  await showAll(page);
  await expect(page.locator('.result-item').filter({ hasText: title })).toBeVisible();
}

async function showAll(page) {
  const all = page.getByRole('button', { name: 'За всё время', exact: true });
  const enabled = await all.isEnabled();
  if (enabled) {
    await all.click();
  }
}

export async function removeResult(client, title) {
  const { page } = client;
  await open(client, '/results');
  await page.getByPlaceholder(titleField).waitFor();
  await showAll(page);
  await page.getByPlaceholder('Поиск по итогам').fill(title);
  const item = page.locator('.result-item').filter({ hasText: title });
  const count = await item.count();
  if (count === 1) {
    page.once('dialog', (dialog) => dialog.accept());
    await item.getByRole('button', { name: 'Удалить итог', exact: true }).click();
    await expect(item).toHaveCount(0);
  }
}
