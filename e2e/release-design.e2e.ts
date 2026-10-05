import { expect, test } from './fixtures';
import { visualDemoFilePath } from './demo-data';
import { expectPageFitsViewport } from './layout-assertions';

test.use({ confirmBackupImports: false });

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-08-30T12:00:00.000Z'));
  await page.goto('/settings');
  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('input[type="file"]').setInputFiles(visualDemoFilePath);
  await expect(page.locator('input[type="file"]')).toHaveValue('');
});

for (const period of ['week', 'month']) {
  test(`protects an unsaved ${period} review across period and route navigation`, async ({ page }) => {
    await page.goto(period === 'week' ? '/week?week=2026-08-24' : '/month');
    const input = page.getByPlaceholder(
      period === 'week' ? 'Можно продолжить как есть или пока ничего не решать' : 'Что стоит продолжить, изменить или проверить',
    );
    await input.fill('Собственный вывод, который ещё не сохранён');
    const periodTitle = await page.locator('.period-nav__label strong').textContent();
    let confirmations = 0;
    const cancel = async (dialog: import('@playwright/test').Dialog) => {
      confirmations += 1;
      expect(dialog.message()).toContain('Обзор ещё не сохранён');
      await dialog.dismiss();
    };
    page.on('dialog', cancel);
    await page.getByRole('button', { name: 'Предыдущий период' }).click();
    await expect(page.locator('.period-nav__label strong')).toHaveText(periodTitle!);
    await expect(input).toHaveValue('Собственный вывод, который ещё не сохранён');
    await page.getByRole('navigation', { name: 'Основная навигация' }).getByRole('link', { name: 'История' }).click();
    await expect(input).toHaveValue('Собственный вывод, который ещё не сохранён');
    expect(confirmations).toBe(2);
    page.off('dialog', cancel);

    await page.getByRole('button', { name: period === 'week' ? 'Сохранить обзор' : 'Сохранить обзор месяца', exact: true }).click();
    await expect(page.getByText(period === 'week' ? 'Обзор недели сохранён' : 'Итог месяца сохранён', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Предыдущий период' }).click();
    await page.getByRole('button', { name: 'Следующий период' }).click();
    await expect(input).toHaveValue('Собственный вывод, который ещё не сохранён');

    await input.fill('Черновик, от которого я решил отказаться');
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Предыдущий период' }).click();
    await expect(page.locator('.period-nav__label strong')).not.toHaveText(periodTitle!);
    await page.getByRole('button', { name: 'Следующий период' }).click();
    await expect(input).toHaveValue('Собственный вывод, который ещё не сохранён');
  });
}

test('exposes selected scales and analysis controls to assistive technology', async ({ page }) => {
  await page.goto('/today');
  for (const name of ['Качество сна', 'Энергия за день']) {
    const group = page.getByRole('group', { name, exact: true });
    await group.getByRole('button', { name: '3', exact: true }).focus();
    await page.keyboard.press('Space');
    await expect(group.getByRole('button', { pressed: true })).toHaveText('3');
    await group.getByRole('button', { name: '4', exact: true }).press('Enter');
    await expect(group.getByRole('button', { pressed: true })).toHaveText('4');
  }
  await page.goto('/trends');
  const range = page.getByRole('group', { name: 'Период истории' });
  await range.getByRole('button', { name: '6 месяцев' }).click();
  await expect(range.getByRole('button', { pressed: true })).toHaveText('6 месяцев');
  await page.locator('.trends-metric-details > summary').click();
  const metrics = page.locator('.metric-switcher');
  await metrics.getByRole('button', { name: 'Энергия', exact: true }).click();
  await expect(metrics.getByRole('button', { pressed: true })).toHaveText('Энергия');
});

test('lets keyboard users reach and scroll the full week map', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/week?week=2026-08-24');
  const details = page.locator('details').filter({ has: page.locator('.heatmap') });
  await details.locator(':scope > summary').click();
  const map = page.getByRole('region', { name: 'Карта недели по дням' });
  await page.keyboard.press('Tab');
  await map.focus();
  await expect(map).toBeFocused();
  expect(await map.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe('none');
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => map.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
});

test('wraps a long custom activity without clipping the mobile form', async ({ page }) => {
  const label = 'Ш'.repeat(40);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#new-activity-option').fill(label);
  await page.locator('#movement-options').getByRole('button', { name: 'Добавить', exact: true }).click();
  await expect(page.getByText('Варианты активности сохранены', { exact: true })).toBeVisible();
  await page.goto('/today');
  await page.getByText('Дополнительные разделы', { exact: true }).click();
  const chip = page.getByRole('button', { name: label });
  await chip.scrollIntoViewIfNeeded();
  const bounds = await chip.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  await chip.click();
  await expect(chip).toHaveAttribute('aria-pressed', 'true');
  await expectPageFitsViewport(page, 'long custom activity');
});

for (const route of ['/today', '/settings']) {
  test(`keeps ${route} actions within the tablet viewport with an enlarged root font`, async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1000 });
    await page.goto(route);
    await page.locator('.page').waitFor();
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '200%';
    });
    await expectPageFitsViewport(page, `${route} enlarged root font`);
    if (route === '/settings') {
      await page.getByRole('button', { name: 'Аккаунт и безопасность', exact: true }).click();
      await expect(page.locator('#account-settings')).toBeVisible();
    }
  });
}
