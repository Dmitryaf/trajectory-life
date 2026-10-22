import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';

test.describe.configure({ mode: 'serial' });
let server: Server;
let origin: string;
let phase: 'A' | 'B' = 'A';
let fixtureRoot: string;
const contentTypes: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.webmanifest': 'application/manifest+json',
};

test.beforeAll(async () => {
  test.setTimeout(90_000);
  const outputs = path.resolve('test-results');
  await mkdir(outputs, { recursive: true });
  fixtureRoot = await mkdtemp(path.join(outputs, 'pwa-update-'));
  await promisify(execFile)(
    process.execPath,
    [path.resolve('node_modules/vite/bin/vite.js'), 'build', '--outDir', path.join(fixtureRoot, 'A'), '--logLevel', 'error'],
    {
      env: {
        ...process.env,
        NODE_ENV: 'production',
        VITE_REQUIRE_AUTH: 'false',
        VITE_SUPABASE_URL: '',
        VITE_SUPABASE_ANON_KEY: '',
        VITE_ERROR_MONITORING_ENABLED: 'false',
      },
      timeout: 60_000,
    },
  );
  await cp(path.join(fixtureRoot, 'A'), path.join(fixtureRoot, 'B'), { recursive: true });
  for (const version of ['A', 'B']) {
    const directory = path.join(fixtureRoot, version);
    const html = (await readFile(path.join(directory, 'index.html'), 'utf8')).replace(
      '<head>',
      `<head><meta name="pwa-test-version" content="${version}">`,
    );
    const revision = createHash('md5').update(html).digest('hex');
    const sw = await readFile(path.join(directory, 'sw.js'), 'utf8');
    const indexRevision = /((?:"url"|url):\s*"index\.html",\s*(?:"revision"|revision):\s*")[^"]+(")/;
    expect(sw).toMatch(indexRevision);
    await writeFile(path.join(directory, 'index.html'), html);
    await writeFile(
      path.join(directory, 'sw.js'),
      sw.replace(indexRevision, (_match, prefix: string, suffix: string) => `${prefix}${revision}${suffix}`),
    );
  }
  server = createServer(async (request, response) => {
    const root = path.join(fixtureRoot, phase);
    const pathname = new URL(request.url!, 'http://localhost').pathname;
    const filename = path.resolve(root, '.' + (path.extname(pathname) ? pathname : '/index.html'));
    if (!filename.startsWith(root + path.sep)) {
      response.writeHead(400).end();
      return;
    }
    try {
      const content = await readFile(filename);
      response.writeHead(200, {
        'Content-Type': contentTypes[path.extname(filename)] || 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      response.end(content);
    } catch {
      response.writeHead(404).end();
    }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Expected a local diagnostic server');
  }
  origin = `http://127.0.0.1:${address.port}`;
});

test.afterAll(async () => {
  if (server) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

async function openInstalledVersion(page: Page) {
  phase = 'A';
  await page.goto(`${origin}/today`);
  await expect(page.locator('.app-shell')).toBeVisible();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
}

async function activateNextVersion(page: Page, waitForActivation = false) {
  phase = 'B';
  await page.evaluate(async (waitForActivation) => {
    const activated = waitForActivation
      ? new Promise<void>((resolve) => {
          navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true });
        })
      : undefined;
    await (await navigator.serviceWorker.getRegistration())?.update();
    await activated;
  }, waitForActivation);
}

test('refreshes an existing public landing after a real worker update and keeps its gallery usable', async ({ page }) => {
  test.setTimeout(30_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await openInstalledVersion(page);
  await page.goto(origin);
  await expect(page.locator('.landing-hero')).toBeVisible();
  await expect(page.locator('meta[name="pwa-test-version"]')).toHaveAttribute('content', 'A');
  await activateNextVersion(page);
  await expect(page.locator('meta[name="pwa-test-version"]')).toHaveAttribute('content', 'B', { timeout: 15_000 });
  for (const title of ['Сегодня', 'Неделя', 'Месяц', 'История', 'Журнал', 'Настройки']) {
    await page.getByRole('tab', { name: title, exact: true }).click();
    await expect(page.getByRole('tabpanel').getByRole('img')).toHaveJSProperty('naturalWidth', 390);
  }
});

test('keeps unsaved input on the working screen while a new worker activates', async ({ page }) => {
  test.setTimeout(30_000);
  await openInstalledVersion(page);
  const closeIntro = page.getByRole('button', { name: 'Закрыть объяснение' });
  if (await closeIntro.isVisible()) {
    await closeIntro.click();
  }
  await page.getByRole('button', { name: 'Начать с сегодняшнего дня', exact: true }).click();
  const note = page.getByLabel('Заметка дня', { exact: true });
  await note.fill('Несохранённый текст во время обновления приложения');
  await expect(page.locator('.floating-save-button')).toBeVisible();
  await activateNextVersion(page, true);
  await expect
    .poll(() =>
      page.evaluate(async () => {
        for (const name of await caches.keys()) {
          const response = await (await caches.open(name)).match(new URL('/index.html', location.href), { ignoreSearch: true });
          if (response && (await response.text()).includes('name="pwa-test-version" content="B"')) {
            return true;
          }
        }
        return false;
      }),
    )
    .toBe(true);
  await expect(page.locator('meta[name="pwa-test-version"]')).toHaveAttribute('content', 'A');
  await expect(note).toHaveValue('Несохранённый текст во время обновления приложения');
  await page.locator('.floating-save-button').click();
  await expect(page.locator('.floating-save-button')).toBeHidden();
});
