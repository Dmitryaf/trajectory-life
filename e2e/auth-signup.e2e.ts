import { createServer, type ViteDevServer } from 'vite';
import { expect, test } from './fixtures';
import { expectPageFitsViewport } from './layout-assertions';

let server: ViteDevServer;
let origin: string;
const backend = 'https://signup.example.test';
test.use({ allowedBrowserErrors: [/server responded with a status of 429/] });

test.beforeAll(async () => {
  server = await createServer({
    logLevel: 'error',
    define: {
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(backend),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify('synthetic-public-key'),
      'import.meta.env.VITE_REQUIRE_AUTH': JSON.stringify('true'),
      'import.meta.env.VITE_ENABLE_SIGNUP': JSON.stringify('true'),
      'import.meta.env.VITE_PRODUCT_TELEMETRY_ENABLED': JSON.stringify('false'),
    },
    server: { host: '127.0.0.1', port: 0 },
  });
  await server.listen();
  const address = server.httpServer?.address();
  if (!address || typeof address === 'string') {
    throw new Error('Signup test server did not bind a TCP port');
  }
  origin = `http://127.0.0.1:${address.port}`;
});
test.afterAll(async () => server?.close());

test('registers without an invitation and keeps confirmation and retry paths usable', async ({ page }, testInfo) => {
  await page.route(`${backend}/**`, async (route) => {
    const endpoint = new URL(route.request().url()).pathname;
    if (endpoint === '/auth/v1/signup') {
      const body = route.request().postDataJSON();
      expect(body.email).toBe('synthetic@example.test');
      expect(body.password).toBe('safe-password');
      expect(body.data ?? {}).not.toHaveProperty('beta_invite_code');
      await route.fulfill({ json: { user: { id: 'synthetic-user', email: body.email }, session: null } });
      return;
    }
    await route.fulfill({ json: {} });
  });

  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${origin}/`);
    await page.getByRole('link', { name: 'Создать аккаунт', exact: true }).first().click();
    await expect(page.getByRole('heading', { name: 'Создайте аккаунт', exact: true })).toBeVisible();
    await expect(page.getByLabel('Код приглашения')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Как обрабатываются ваши данные' })).toHaveAttribute('href', '/data-policy');
    await page.getByRole('textbox', { name: 'Email', exact: true }).fill('synthetic@example.test');
    await page.getByLabel('Пароль', { exact: true }).fill('safe-password');
    const policyPopup = page.waitForEvent('popup');
    await page.getByRole('link', { name: 'Как обрабатываются ваши данные' }).click();
    const policy = await policyPopup;
    await expect(policy.getByRole('heading', { level: 1, name: 'Политика данных' })).toBeVisible();
    await expect(policy.locator('.app-shell')).toHaveCount(0);
    await policy.close();
    await expect(page.getByRole('textbox', { name: 'Email', exact: true })).toHaveValue('synthetic@example.test');
    await expect(page.getByLabel('Пароль', { exact: true })).toHaveValue('safe-password');
    await page.getByLabel('Повтори пароль', { exact: true }).fill('different-password');
    await page.getByRole('button', { name: 'Создать аккаунт', exact: true }).last().click();
    await expect(page.getByRole('alert')).toHaveText('Пароли не совпадают.');
    await page.getByLabel('Повтори пароль', { exact: true }).fill('safe-password');
    await expectPageFitsViewport(page, `signup at ${width}px`);
    await page.screenshot({ path: testInfo.outputPath(`signup-${width}.png`), fullPage: true });
    await page.getByRole('button', { name: 'Создать аккаунт', exact: true }).last().click();
    await expect(page.getByRole('heading', { name: 'Аккаунт создан' })).toBeVisible();
    await expect(page.getByText('Подтверди email по ссылке.')).toBeVisible();
    await page.getByRole('button', { name: 'Отправить письмо ещё раз' }).click();
    await expect(page.getByRole('status')).toContainText('Письмо отправлено повторно');
    await page.getByRole('button', { name: 'Изменить email', exact: true }).click();
    await expect(page.getByRole('textbox', { name: 'Email', exact: true })).toBeFocused();
    await expect(page.getByRole('textbox', { name: 'Email', exact: true })).toHaveValue('synthetic@example.test');
  }
});

test('finds registration after entering through the landing sign-in link', async ({ page }, testInfo) => {
  await page.route(`${backend}/**`, (route) => route.fulfill({ json: {} }));
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${origin}/`);
    await page.getByRole('link', { name: 'Войти', exact: true }).first().click();
    await expect(page.getByText('Нет аккаунта?', { exact: true })).toBeVisible();
    await expectPageFitsViewport(page, `sign-in at ${width}px`);
    await page.screenshot({ path: testInfo.outputPath(`sign-in-${width}.png`), fullPage: true });
    await page.locator('.auth-mode').getByRole('button', { name: 'Создать аккаунт', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Создайте аккаунт', exact: true })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Email', exact: true })).toBeFocused();
    await page.locator('.auth-mode').getByRole('button', { name: 'Войти', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Войдите в «Траекторию»' })).toBeVisible();
  }
});

test('shows server rate limiting and allows returning to sign-in', async ({ page }) => {
  await page.route(`${backend}/**`, (route) =>
    route.fulfill({ status: 429, json: { code: 'over_email_send_rate_limit', msg: 'Too many requests' } }),
  );
  await page.goto(`${origin}/access?mode=sign-up`);
  await page.getByRole('textbox', { name: 'Email', exact: true }).fill('synthetic@example.test');
  await page.getByLabel('Пароль', { exact: true }).fill('safe-password');
  await page.getByLabel('Повтори пароль', { exact: true }).fill('safe-password');
  await page.getByRole('button', { name: 'Создать аккаунт', exact: true }).last().click();
  await expect(page.getByRole('alert')).toContainText('Слишком много попыток');
  await expect(page.getByLabel('Пароль', { exact: true })).toHaveValue('');
  await page.getByRole('button', { name: 'Войти', exact: true }).first().click();
  await expect(page.getByRole('heading', { name: 'Войдите в «Траекторию»' })).toBeVisible();
});
