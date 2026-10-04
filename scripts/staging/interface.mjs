/* global document, getComputedStyle */
import { randomUUID } from 'node:crypto';
import { expect } from '@playwright/test';

import { open, addResult, removeResult } from './ui-helpers.mjs';

export async function longNotes(client) {
  const { page } = client;
  const run = randomUUID().slice(0, 8);
  const short = `QA ${run} короткая запись`;
  const long = `QA ${run} длинная запись`;
  try {
    await addResult(client, short, 'Кратко.');
    await addResult(client, long, 'Синтетический контекст для проверки раскрытия длинного текста. '.repeat(30));
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      const shortItem = page.locator('.result-item').filter({ hasText: short });
      const longItem = page.locator('.result-item').filter({ hasText: long });
      await expect(shortItem.getByRole('button', { name: 'Показать полностью' })).toHaveCount(0);
      await longItem.getByRole('button', { name: 'Показать полностью' }).click();
      await longItem.getByRole('button', { name: 'Свернуть', exact: true }).click();
      await expect(longItem.getByRole('button', { name: 'Показать полностью' })).toBeVisible();
    }
    return { widths: [390, 1440], shortNotTruncated: true, longExpandedAndCollapsed: true };
  } finally {
    await page.setViewportSize({ width: 1280, height: 900 });
    await removeResult(client, short);
    await removeResult(client, long);
  }
}

export async function analysisExport(client) {
  const title = `QA export ${randomUUID()}`;
  const date = await client.page.evaluate(() => {
    const day = new Date();
    day.setDate(day.getDate() - ((day.getDay() + 6) % 7) - 1);
    return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
  });
  try {
    await addResult(client, title, 'Synthetic completed-week export probe', date);
    return await verifyExport(client, title, date);
  } finally {
    await removeResult(client, title);
  }
}

async function verifyExport(client, title, date) {
  const { page } = client;
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: client.origin });
  await open(client, `/week?week=${date}`);
  const copy = page.getByRole('button', { name: 'Подготовить текст для нейросети', exact: true });
  await expect(copy).toBeVisible();
  await copy.click();
  await expect(page.getByText('Текст для нейросети скопирован', { exact: true })).toBeVisible();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied.includes('ДАННЫЕ ДЛЯ АНАЛИЗА')).toBe(true);
  expect(copied.includes(title)).toBe(true);
  expect(copied.includes('"generatedAt"')).toBe(false);
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Скачать данные', exact: true }).click();
  const download = await pending;
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  expect(payload.period).toBe('week');
  expect(payload).toHaveProperty('entries');
  expect(payload).toHaveProperty('settingsSnapshot');
  expect(payload.results.some((result) => result.title === title)).toBe(true);
  return { nativeClipboardVerified: true, jsonParsed: true, period: payload.period, syntheticResultIncluded: true };
}

async function reachWithTab(page, target) {
  await expect(target).toBeVisible();
  const limit = (await page.locator('a[href],button,input,select,textarea,summary,[tabindex]').count()) * 4 + 2;
  for (let step = 0; step < limit; step++) {
    await page.keyboard.press('Tab');
    const focused = await target.evaluate((element) => element === document.activeElement);
    if (focused) {
      return;
    }
  }
  await expect(target).toBeFocused();
}

export async function keyboardNavigation(client) {
  const { page } = client;
  await page.setViewportSize({ width: 1280, height: 900 });
  await open(client, '/today');
  const review = page.getByRole('navigation', { name: 'Основная навигация' }).getByRole('link', { name: 'Обзор', exact: true });
  await reachWithTab(page, review);
  expect(await review.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe('none');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/week$/);
  const month = page.getByRole('navigation', { name: 'Период обзора' }).getByRole('link', { name: 'Месяц', exact: true });
  await reachWithTab(page, month);
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/month$/);
  const help = page.getByRole('button', { name: 'Как работает приложение' });
  await reachWithTab(page, help);
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Зачем нужна «Траектория»' });
  const first = dialog.getByRole('button', { name: 'Закрыть объяснение' });
  const last = dialog.getByRole('link', { name: 'Начать запись' });
  await expect(first).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(last).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(first).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(help).toBeFocused();
  return { nativeKeyboard: true, dialogFocusTrap: true };
}

export async function zoomLayout(client) {
  const { page } = client;
  const routes = ['/today', '/week', '/month', '/more', '/results', '/events', '/settings'];
  try {
    await page.setViewportSize({ width: 1280, height: 900 });
    for (const route of routes) {
      await open(client, route);
      await page.evaluate(() => {
        document.documentElement.style.zoom = '2';
      });
      const geometry = await page.evaluate(() => ({
        width: document.documentElement.scrollWidth,
        viewport: document.documentElement.clientWidth,
      }));
      expect(geometry.width, `${route} at 1280px with CSS zoom 200%`).toBeLessThanOrEqual(geometry.viewport + 1);
      await expect(page.getByRole('navigation', { name: 'Основная навигация' })).toBeVisible();
    }
  } finally {
    await page.setViewportSize({ width: 1280, height: 900 });
    await open(client, '/today');
  }
  return { cssZoom: '200%', viewport: 1280, routes };
}
