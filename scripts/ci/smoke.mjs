/* global document, innerWidth */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

async function get(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  assert.equal(response.status, 200, `Expected 200: ${url}`);
  return response;
}

export async function assetSignature(origin) {
  const response = await get(origin);
  assert.match(response.headers.get('content-type'), /text\/html/);
  assert.match(response.headers.get('cache-control'), /must-revalidate/);
  const html = await response.text();
  const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^" ]+\.(?:js|css))"/g)].map((match) => match[1]).sort();
  assert.ok(assets.length >= 2, 'Application entry assets are missing');
  const signature = [];
  for (const path of assets) {
    const resource = await get(new URL(path, origin));
    assert.match(resource.headers.get('content-type'), path.endsWith('.js') ? /javascript/ : /text\/css/);
    signature.push({
      path,
      hash: createHash('sha256')
        .update(await resource.text())
        .digest('hex'),
    });
  }
  return signature;
}

export async function smokePublic(origin) {
  const assets = await assetSignature(origin);
  const sw = await get(`${origin}/sw.js`);
  assert.match(sw.headers.get('content-type'), /javascript/);
  assert.match(sw.headers.get('cache-control'), /must-revalidate/);
  const manifest = await (await get(`${origin}/manifest.webmanifest`)).json();
  assert.equal(manifest.start_url, '/today');
  for (const icon of manifest.icons) {
    await get(new URL(icon.src, origin));
  }
  const missing = await fetch(`${origin}/assets/release-smoke-missing.js`, { signal: AbortSignal.timeout(20_000) });
  assert.equal(missing.status, 404);
  for (const endpoint of ['/api/feedback', '/api/client-error']) {
    const response = await fetch(`${origin}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
      signal: AbortSignal.timeout(20_000),
    });
    assert.equal(response.status, 401, `Unauthenticated API: ${endpoint}`);
  }
  const { chromium } = await import('@playwright/test');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ serviceWorkers: 'block' });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(origin);
      await page.locator('h1').waitFor();
      await page.goto(`${origin}/today`);
      await page.locator('input[type="password"]').waitFor();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
    }
    for (const path of ['/settings', '/week', '/month', '/events', '/results', '/trends', '/more']) {
      await page.goto(`${origin}${path}`);
      await page.locator('input[type="password"]').waitFor();
    }
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
  return assets;
}
