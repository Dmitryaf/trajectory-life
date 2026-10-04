import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { expect, test } from './fixtures';
import { expectPageFitsViewport } from './layout-assertions';

const require = createRequire(import.meta.url);
const axeSource = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

test('keeps the public landing independent from authentication and product storage', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Дневник дел, событий и самочувствия' })).toBeVisible();
  await expect(page.locator('.app-shell')).toHaveCount(0);
  await expect(page.locator('a[href="/access?mode=sign-in"]')).toHaveCount(2);
  await expect(page.getByRole('link', { name: 'Посмотреть примеры' })).toHaveAttribute('href', '#product');
  await page.getByRole('link', { name: 'Все возможности', exact: false }).click();
  await expect(page.locator('#features')).toBeInViewport();
  for (const name of [
    'Записи дня',
    'Неделя и месяц',
    'История изменений',
    'Цель и личный эксперимент',
    'Журнал',
    'Копии и внешний анализ',
  ]) {
    await expect(page.locator('#features').getByRole('heading', { name, exact: true })).toBeVisible();
  }
  await expect(page.getByRole('link', { name: 'Политика данных', exact: true })).toHaveAttribute('href', '/data-policy');
  await expect(page).toHaveTitle('Траектория — личная картина времени');
  await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /недели и месяцы целиком/);

  const databases = await page.evaluate(async () =>
    typeof indexedDB.databases === 'function' ? (await indexedDB.databases()).map((database) => database.name) : [],
  );
  expect(databases.filter(Boolean)).toEqual([]);
  const loadedScripts = await page.evaluate(() => performance.getEntriesByType('resource').map((entry) => entry.name));
  expect(loadedScripts.some((url) => /analytics-charts|ProductShell|cloudSync/.test(url))).toBe(false);

  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});

test('opens the policy directly without authentication and preserves the legacy link', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Политика данных', exact: true }).click();
  await expect(page).toHaveURL(/\/data-policy$/);
  await expect(page.getByRole('heading', { name: 'Политика данных', level: 1 })).toBeVisible();
  await expect(page).toHaveTitle('Политика данных · Траектория');
  await expect(page.locator('#data-policy')).toContainText('Траектория — приложение для личных записей');
  await expect(page.locator('#data-policy')).not.toContainText('Афонасенко');
  await expect(page.locator('#data-policy')).toContainText('Пользование приложением не ограничивает');
  await expect(page.locator('.app-shell')).toHaveCount(0);
  await expect(page.locator('main details')).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Политика данных', level: 1 })).toBeVisible();
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expectPageFitsViewport(page, `data policy at ${width}px`);
  }
  const databases = await page.evaluate(async () =>
    typeof indexedDB.databases === 'function' ? (await indexedDB.databases()).map((database) => database.name) : [],
  );
  expect(databases.filter(Boolean)).toEqual([]);
  const loadedScripts = await page.evaluate(() => performance.getEntriesByType('resource').map((entry) => entry.name));
  expect(loadedScripts.some((url) => /ProductShell|cloudSync|installation/.test(url))).toBe(false);
  await page.getByRole('link', { name: 'На главную', exact: false }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto('/#data-policy');
  await expect(page).toHaveURL(/\/data-policy$/);
});

test('opens the existing product entry and preserves direct product and unknown routes', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Войти в Траекторию' }).first().click();
  await expect(page).toHaveURL(/\/today$/);
  await expect(page.locator('.page--today')).toBeVisible();

  await page.goto('/week');
  await expect(page.locator('.page--week')).toBeVisible();
  await page.reload();
  await expect(page.locator('.page--week')).toBeVisible();

  await page.goto('/missing-landing-route');
  await expect(page.getByRole('heading', { name: 'Такой страницы нет' })).toBeVisible();
  await page.getByRole('link', { name: 'Перейти к «Сегодня»' }).click();
  await expect(page).toHaveURL(/\/today$/);
});

test('keeps the landing readable and accessible across supported widths', async ({ page, browserName }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const width of [320, 360, 390, 720, 721, 768, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await expectPageFitsViewport(page, `landing at ${width}px`);
    await expect(page.locator('.landing-header').getByRole('link', { name: 'Войти', exact: true })).toBeVisible();
    await expect(page.locator('.landing-example')).toHaveCount(0);
    await expect(page.getByRole('tab')).toHaveCount(6);
    const productLayout = await page.locator('#product').evaluate((section) => {
      const caption = section.querySelector('.landing-gallery__caption')!.getBoundingClientRect();
      const screen = section.querySelector('.landing-gallery__screen')!.getBoundingClientRect();
      return { captionBottom: caption.bottom, screenTop: screen.top };
    });
    expect(productLayout.screenTop).toBeGreaterThanOrEqual(productLayout.captionBottom - 1);
    for (const link of await page.locator('.landing-actions a').all()) {
      await expect(link).toHaveCSS('text-decoration-line', 'none');
    }
    if (browserName === 'chromium' && (width === 390 || width === 1440)) {
      for (const image of await page.locator('.landing-product img').all()) {
        await image.scrollIntoViewIfNeeded();
        await expect(image).toHaveJSProperty('naturalWidth', width === 390 ? 390 : 1200);
      }
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: testInfo.outputPath(`landing-${width}.png`), fullPage: true, animations: 'disabled' });
      if (width === 1440) {
        await page.locator('.landing-product').screenshot({ path: testInfo.outputPath('landing-gallery.png'), animations: 'disabled' });
      }
    }
  }

  if (browserName !== 'chromium') {
    return;
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.addScriptTag({ content: axeSource });
  const violations = await page.evaluate(async () => {
    const result = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] } });
    return result.violations
      .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
      .map((violation) => violation.id);
  });
  expect(violations).toEqual([]);
});

test('lets visitors browse every example with the keyboard without registering', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('tab', { name: 'Сегодня', exact: true }).focus();
  for (const title of ['Неделя', 'Месяц', 'История', 'Журнал', 'Настройки', 'Сегодня']) {
    await page.keyboard.press('ArrowRight');
    const tab = page.getByRole('tab', { name: title, exact: true });
    await expect(tab).toBeFocused();
    await expect(tab).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('tabpanel').getByRole('img')).toBeVisible();
  }
  await page.keyboard.press('End');
  await expect(page.getByRole('tab', { name: 'Настройки', exact: true })).toBeFocused();
  await page.keyboard.press('Home');
  await expect(page.getByRole('tab', { name: 'Сегодня', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Предыдущий экран' }).click();
  await expect(page.getByRole('tab', { name: 'Настройки', exact: true })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', { name: 'Следующий экран' }).click();
  await expect(page.getByRole('tab', { name: 'Сегодня', exact: true })).toHaveAttribute('aria-selected', 'true');
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const title of ['Сегодня', 'Неделя', 'Месяц', 'История', 'Журнал', 'Настройки']) {
      await page.getByRole('tab', { name: title, exact: true }).click();
      const image = page.getByRole('tabpanel').getByRole('img');
      await expect(image).toHaveJSProperty('complete', true);
      await expect(image).toHaveJSProperty('naturalWidth', width === 390 ? 390 : 1200);
      await expectPageFitsViewport(page, `${title} gallery at ${width}px`);
    }
  }
});
