import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import { writeDemoFile } from './generate-test-user-data.mjs';

/* global Image, document, requestAnimationFrame, window */

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const outputDirectory = path.join(projectRoot, 'src', 'features', 'landing', 'assets');
const fixturePath = path.join(projectRoot, 'demo', 'generated', 'trajectory-landing.json');
const baseUrl = 'http://127.0.0.1:4174';

await mkdir(outputDirectory, { recursive: true });
await writeDemoFile({ anchor: '2026-08-26', output: fixturePath });
process.env.VITE_REQUIRE_AUTH = 'false';
process.env.VITE_ENABLE_SIGNUP = 'false';
process.env.VITE_PRODUCT_TELEMETRY_ENABLED = 'false';
process.env.VITE_FEEDBACK_ENABLED = 'false';

const server = await createServer({
  envFile: false,
  logLevel: 'error',
  server: { host: '127.0.0.1', port: 4174, strictPort: true },
});
await server.listen();

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  await page.route('**/*', (route) => (new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort()));
  page.on('dialog', (dialog) =>
    dialog.message().startsWith('Заменить текущие записи и настройки данными из файла') ? dialog.accept() : dialog.dismiss(),
  );
  await page.clock.setFixedTime(new Date('2026-08-26T12:00:00.000Z'));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`${baseUrl}/settings`);
  await page.locator('input[type="file"]').setInputFiles(fixturePath);
  await page.getByText('Резервная копия восстановлена на этом устройстве', { exact: true }).waitFor();

  const captures = [
    { route: '/today', selector: '.page--today', file: 'today.webp' },
    { route: '/week?week=2026-08-24', selector: '.page--week', file: 'week.webp' },
    { route: '/month?month=2026-08', selector: '.page--month', file: 'month.webp' },
    {
      route: '/trends',
      selector: '.page--trends',
      file: 'history.webp',
      expand: '.trends-metric-details > summary',
      scroll: '.trends-metric-details',
    },
    { route: '/results', selector: '.page--archive', file: 'journal.webp' },
    { route: '/settings', selector: '#daily-blocks', file: 'settings.webp' },
  ];

  for (const capture of captures) {
    for (const viewport of [
      { width: 390, height: 844 },
      { width: 1200, height: 780 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto(`${baseUrl}${capture.route}`);
      await page.locator(capture.selector).waitFor();
      if (capture.expand) {
        await page.locator(capture.expand).click();
      }
      await page.evaluate(async () => {
        await document.fonts.ready;
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        window.scrollTo(0, 0);
      });
      if (capture.scroll) {
        await page.locator(capture.scroll).evaluate((element) => element.scrollIntoView({ block: 'start' }));
        await page.evaluate((offset) => window.scrollBy(0, -offset), viewport.width > 720 ? 96 : 16);
      }
      const png = await page.screenshot({ type: 'png', animations: 'disabled', caret: 'hide' });
      const webpDataUrl = await page.evaluate(async (base64) => {
        const image = new Image();
        image.src = `data:image/png;base64,${base64}`;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        canvas.getContext('2d')?.drawImage(image, 0, 0);
        return canvas.toDataURL('image/webp', 0.84);
      }, png.toString('base64'));
      const filename = viewport.width === 390 ? capture.file : capture.file.replace('.webp', '-desktop.webp');
      await writeFile(path.join(outputDirectory, filename), Buffer.from(webpDataUrl.split(',')[1], 'base64'));
    }
  }
} finally {
  await browser.close();
  await server.close();
}

console.log('Landing media captured from deterministic synthetic product data.');
