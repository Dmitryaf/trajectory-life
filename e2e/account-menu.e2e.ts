import { expect, test } from './fixtures';
import { expectPageFitsViewport } from './layout-assertions';

for (const width of [390, 1440]) {
  test(`dismisses the account popup without losing the keyboard position at ${width}px`, async ({ page, browserName }, testInfo) => {
    const windowsWebKit = browserName === 'webkit' && process.platform === 'win32';
    if (windowsWebKit) {
      testInfo.annotations.push({
        type: 'coverage',
        description: 'Windows WebKit skips native links in Tab order; only link focus is programmatic.',
      });
    }
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/e2e/fixtures/account-menu.html');
    const trigger = page.getByLabel('Открыть меню аккаунта');
    const details = page.locator('details');
    const settings = page.getByRole('link', { name: 'Настройки', exact: true });
    await page.keyboard.press('Tab');
    await expect(page.locator('#before')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(trigger).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(settings).toBeVisible();
    await expectPageFitsViewport(page, `account popup at ${width}px`);
    await page.screenshot({ path: testInfo.outputPath(`account-menu-${width}.png`), animations: 'disabled' });
    await page.keyboard.press('Tab');
    if (windowsWebKit) {
      await settings.focus();
    }
    await expect(settings).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(details).not.toHaveAttribute('open');
    await expect(trigger).toBeFocused();

    await page.keyboard.press('Space');
    await page.keyboard.press('Tab');
    if (windowsWebKit) {
      await settings.focus();
    }
    await expect(settings).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Выйти', exact: true })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.locator('#after')).toBeFocused();
    await expect(details).not.toHaveAttribute('open');
    await trigger.click();
    await page.locator('#before').click();
    await expect(details).not.toHaveAttribute('open');
    await expect(page.locator('#sign-outs')).toHaveText('0');

    await trigger.click();
    await page.getByRole('button', { name: 'Выйти', exact: true }).click();
    await expect(page.locator('#sign-outs')).toHaveText('1');
    await expect(details).not.toHaveAttribute('open');
  });
}
