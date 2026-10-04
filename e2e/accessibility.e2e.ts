import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import type { Locator } from '@playwright/test';
import { expect, test } from './fixtures';
import { demoFilePath } from './demo-data';
import { expectPageFitsViewport } from './layout-assertions';

const require = createRequire(import.meta.url);
const axeSource = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const criticalRoutes = ['/today', '/week', '/month', '/trends', '/more', '/results', '/events', '/settings'];

test.beforeEach(async ({ page }) => {
  await page.goto('/settings');
  await page.locator('input[type="file"]').setInputFiles(demoFilePath);
  await expect(page.locator('input[type="file"]')).toHaveValue('');
});

test('has no serious automated accessibility violations on critical routes', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'One deterministic axe run is enough; interaction coverage stays cross-browser.');
  await page.emulateMedia({ reducedMotion: 'reduce' });

  for (const route of criticalRoutes) {
    await page.goto(route);
    await page.locator('.page').waitFor();
    await page.addScriptTag({ content: axeSource });
    const violations = await page.evaluate(async () => {
      const result = await window.axe.run(document, {
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] },
      });
      return result.violations
        .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
        .map((violation) => ({
          id: violation.id,
          impact: violation.impact,
          nodes: violation.nodes.map((node) => ({ target: node.target, summary: node.failureSummary })),
        }));
    });
    expect(violations, `${route} has serious or critical axe findings`).toEqual([]);
  }
});

test('keeps the critical path keyboard-visible and traps focus in dialogs', async ({ page, browserName }, testInfo) => {
  const windowsWebKit = browserName === 'webkit' && process.platform === 'win32';
  if (windowsWebKit) {
    testInfo.annotations.push({
      type: 'coverage',
      description: 'Windows WebKit skips native links in Tab order; link focus is programmatic, dialog keys remain real.',
    });
  }
  async function reachWithTab(target: Locator) {
    await expect(target).toBeVisible();
    if (windowsWebKit) {
      await target.focus();
      return;
    }
    // Native date/time inputs expose multiple keyboard stops inside one element.
    const maximumSteps = (await page.locator('a[href], button, input, select, textarea, summary, [tabindex]').count()) * 4 + 2;
    for (let step = 0; step < maximumSteps; step += 1) {
      await page.keyboard.press('Tab');
      if (await target.evaluate((element) => element === document.activeElement)) {
        return;
      }
    }
    await expect(target, 'The action must be reachable through the real Tab order').toBeFocused();
  }

  await page.goto('/today');
  const reviewLink = page.getByRole('navigation', { name: 'Основная навигация' }).getByRole('link', { name: 'Обзор' });
  await reachWithTab(reviewLink);
  await expect(reviewLink).toBeFocused();
  expect(await reviewLink.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe('none');
  await reviewLink.press('Enter');
  await expect(page).toHaveURL(/\/week/);

  const monthLink = page.getByRole('navigation', { name: 'Период обзора' }).getByRole('link', { name: 'Месяц' });
  await reachWithTab(monthLink);
  await expect(monthLink).toBeFocused();
  expect(await monthLink.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe('none');
  await monthLink.press('Enter');
  await expect(page).toHaveURL(/\/month/);

  const helpButton = page.getByRole('button', { name: 'Как работает приложение' });
  await reachWithTab(helpButton);
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Зачем нужна «Траектория»' });
  const first = dialog.getByRole('button', { name: 'Закрыть объяснение' });
  const last = dialog.getByRole('link', { name: 'Начать запись' });
  await expect(first).toBeFocused();
  await first.press('Shift+Tab');
  await expect(last).toBeFocused();
  await last.press('Tab');
  await expect(first).toBeFocused();
  await first.press('Escape');
  await expect(page.getByRole('button', { name: 'Как работает приложение' })).toBeFocused();
});

for (const route of criticalRoutes) {
  test(`reflows ${route} at 200 percent without hiding navigation`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 640, height: 900 });
    await page.goto(route);
    await page.locator('.page').waitFor();
    await page.evaluate(() => {
      document.documentElement.style.zoom = '2';
    });
    await expectPageFitsViewport(page, `${route} at 200%`);
    await expect(page.getByRole('navigation', { name: 'Основная навигация' })).toBeVisible();
  });
}

test('gives chart users the same facts, sample size and limitations in text', async ({ page }) => {
  await page.goto('/trends');
  await page.locator('.trends-metric-details > summary').click();
  const chart = page.getByRole('img', { name: /Динамика:/ });
  const descriptionId = await chart.getAttribute('aria-describedby');
  expect(descriptionId).toBeTruthy();
  const description = page.locator(`#${descriptionId}`);
  await expect(description).toContainText('наблюдений');
  await expect(description).toContainText('Месячные значения');
  await expect(description).toContainText('не доказывает причину');
});

test('announces an asynchronous save result without relying on a visual toast', async ({ page }) => {
  await page.goto('/settings');
  await page.getByRole('button', { name: 'Данные и синхронизация' }).click();
  await page.locator('input[type="file"]').setInputFiles(demoFilePath);
  const message = page.getByText('Резервная копия восстановлена на этом устройстве', { exact: true }).last();
  await expect(message).toBeVisible();
  expect(await message.evaluate((element) => Boolean(element.closest('[role="status"], [aria-live]')))).toBe(true);
});

declare global {
  interface Window {
    axe: {
      run: (
        context: Document,
        options: { runOnly: { type: 'tag'; values: string[] } },
      ) => Promise<{
        violations: Array<{
          id: string;
          impact: string | null;
          nodes: Array<{ target: unknown; failureSummary?: string }>;
        }>;
      }>;
    };
  }
}
