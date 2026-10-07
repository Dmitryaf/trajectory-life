import { expect, test as base, type ConsoleMessage } from '@playwright/test';

type BrowserErrorOptions = {
  allowedBrowserErrors: RegExp[];
  confirmBackupImports: boolean;
};

export const test = base.extend<BrowserErrorOptions>({
  allowedBrowserErrors: [[], { option: true }],
  confirmBackupImports: [true, { option: true }],
  page: [
    async ({ context, allowedBrowserErrors, confirmBackupImports }, use, testInfo) => {
      // Cold WebKit page creation has its own bounded setup budget.
      const page = await context.newPage();
      if (confirmBackupImports) {
        page.on('dialog', async (dialog) => {
          if (dialog.type() === 'confirm' && dialog.message().startsWith('Заменить текущие записи и настройки данными из файла')) {
            await dialog.accept();
          } else {
            await dialog.dismiss();
          }
        });
      }
      const browserErrors: string[] = [];
      const recordConsoleError = (message: ConsoleMessage) => {
        if (message.type() === 'error') {
          browserErrors.push(`console.error: ${message.text()}`);
        }
      };

      page.on('console', recordConsoleError);
      page.on('pageerror', (error) => browserErrors.push(`pageerror: ${error.message}`));

      await use(page);

      const unexpectedErrors = browserErrors.filter((message) => !allowedBrowserErrors.some((pattern) => pattern.test(message)));
      if (!unexpectedErrors.length) {
        return;
      }

      await testInfo.attach('unexpected-browser-errors.txt', {
        body: unexpectedErrors.join('\n'),
        contentType: 'text/plain',
      });
      expect(unexpectedErrors, 'Unexpected browser errors were reported').toEqual([]);
    },
    { timeout: 60_000 },
  ],
});

export { expect };
export type { Page } from '@playwright/test';
