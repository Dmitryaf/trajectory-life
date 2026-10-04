import { expect, test } from './fixtures';
import { demoFilePath, visualDemoAnchor, visualDemoFilePath } from './demo-data';
import { expectPageFitsViewport, readLayoutBox } from './layout-assertions';

test.beforeEach(async ({ page }) => {
  await page.goto('/settings');
  await page.locator('input[type="file"]').setInputFiles(demoFilePath);
  await expect(page.locator('input[type="file"]')).toHaveValue('');
});

test('keeps action buttons and their neighbours still during slow saves, success and errors', async ({ page }) => {
  // Sixteen saves across four widths exceed the default budget on hosted WebKit.
  test.slow();
  await page.route('**/api/client-error', (route) => route.fulfill({ status: 200, body: '{}' }));
  await page.evaluate(() => {
    type AppElement = HTMLElement & {
      __vue_app__: {
        config: { globalProperties: { $pinia: { _s: Map<string, { saveSettings: (...args: unknown[]) => Promise<void> }> } } };
      };
    };
    const store = (document.getElementById('app') as AppElement).__vue_app__.config.globalProperties.$pinia._s.get('app')!;
    const original = store.saveSettings.bind(store);
    store.saveSettings = async (...args) => {
      await new Promise<void>((resolve, reject) => {
        Object.assign(window, { finishTestSave: (fail: boolean) => (fail ? reject(new Error('Synthetic storage failure')) : resolve()) });
      });
      await original(...args);
    };
  });
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    for (const [name, id] of [
      ['Сохранить блоки', 'daily-blocks'],
      ['Сохранить области', 'life-areas'],
    ]) {
      const button = page.getByRole('button', { name, exact: true });
      await button.scrollIntoViewIfNeeded();
      const element = page.locator(`#${id}`);
      for (const fail of [false, true]) {
        const before = await readLayoutBox(button);
        const container = await readLayoutBox(element);
        await button.click();
        const busy = element.locator('button[aria-busy="true"]');
        await expect(busy).toBeDisabled();
        expect(await readLayoutBox(busy)).toEqual(before);
        expect(await readLayoutBox(element)).toEqual(container);
        await page.evaluate((shouldFail) => {
          (window as unknown as { finishTestSave: (fail: boolean) => void }).finishTestSave(shouldFail);
        }, fail);
        await expect(button).toBeEnabled();
        expect(await readLayoutBox(button)).toEqual(before);
        expect(await readLayoutBox(element)).toEqual(container);
      }
    }
    await expectPageFitsViewport(page, `async settings at ${width}px`);
  }
});

test('separates optional field labels at narrow and wide viewports', async ({ page }) => {
  await page.goto('/today');
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    const label = page.locator('label[for="experiment-note"]');
    await expect(label).toContainText('Что помогло или помешало? необязательно');
    await page.locator('details').evaluateAll((elements) =>
      elements.forEach((element) => {
        element.open = true;
      }),
    );
    await expect(label).toBeVisible();
    const gap = await label.evaluate((element) => {
      const first = [...element.childNodes].find((node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim())!;
      const text = first.textContent!;
      const end = text.trimEnd().length;
      const range = document.createRange();
      range.setStart(first, end - 1);
      range.setEnd(first, end);
      const left = range.getBoundingClientRect();
      const right = element.querySelector('.field-optional')!.getBoundingClientRect();
      return { gap: right.left - left.right, wrapped: right.top > left.bottom - 2 };
    });
    expect(gap.wrapped || gap.gap >= 2).toBe(true);
  }
});

test('waits for a second backup import even while the first success message is visible', async ({ page }) => {
  await page.evaluate(() => {
    const read = File.prototype.text;
    File.prototype.text = async function () {
      await new Promise((resolve) => setTimeout(resolve, 350));
      return read.call(this);
    };
  });
  await page.locator('input[type="file"]').setInputFiles(visualDemoFilePath);
  await expect(page.locator('input[type="file"]')).toHaveValue('');
  await page.goto(`/week?week=${visualDemoAnchor}`);
  await expect(page.locator('.period-records--featured h2')).toHaveCount(2);
});
