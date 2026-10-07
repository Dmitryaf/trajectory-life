/* global document, innerWidth */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { init, parse } from 'es-module-lexer';

await init;

async function get(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  assert.equal(response.status, 200, `Expected 200: ${url}`);
  return response;
}

export const assetLimits = Object.freeze({
  js: 80,
  css: 60,
  requests: 141,
  assetBytes: 8 * 1024 * 1024,
  htmlBytes: 2 * 1024 * 1024,
  totalBytes: 32 * 1024 * 1024,
  requestMs: 20_000,
  totalMs: 120_000,
});

function assetReader(origin) {
  const deadline = Date.now() + assetLimits.totalMs;
  const overall = AbortSignal.timeout(assetLimits.totalMs);
  let requests = 0;
  let totalBytes = 0;
  return async (url, html = false) => {
    assert.equal(url.origin, origin.origin, 'Asset origin must remain unchanged');
    assert.ok(++requests <= assetLimits.requests, 'Asset request limit exceeded');
    const remaining = deadline - Date.now();
    assert.ok(remaining > 0, 'Asset inventory deadline exceeded');
    const response = await fetch(url, {
      method: 'GET',
      credentials: 'omit',
      redirect: 'error',
      signal: AbortSignal.any([overall, AbortSignal.timeout(Math.min(assetLimits.requestMs, remaining))]),
    });
    assert.equal(response.status, 200, 'Published asset request failed');
    let contentType = html ? /text\/html/ : /text\/css/;
    if (!html && url.pathname.endsWith('.js')) {
      contentType = /javascript/;
    }
    assert.match(response.headers.get('content-type'), contentType);
    if (html) {
      assert.match(response.headers.get('cache-control'), /must-revalidate/);
    }
    const limit = html ? assetLimits.htmlBytes : assetLimits.assetBytes;
    const chunks = [];
    let bytes = 0;
    const reader = response.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        bytes += value.byteLength;
        totalBytes += value.byteLength;
        assert.ok(bytes <= limit, 'Asset body size limit exceeded');
        assert.ok(totalBytes <= assetLimits.totalBytes, 'Asset aggregate size limit exceeded');
        assert.ok(Date.now() <= deadline, 'Asset inventory deadline exceeded');
        chunks.push(value);
      }
    } finally {
      await reader.cancel();
    }
    const content = Buffer.concat(chunks);
    const text = content.toString('utf8');
    assert.ok(!text.includes('[SENSITIVE]'), 'Published assets contain redacted build configuration');
    return { text, hash: createHash('sha256').update(content).digest('hex') };
  };
}

function assetPath(reference, parent, origin) {
  assert.ok(
    /^(?:\/assets\/|assets\/|\.\/)[A-Za-z0-9_-][A-Za-z0-9_.-]*\.(?:js|css)$/.test(reference),
    'Only literal flat Vite asset references are supported',
  );
  const url = new URL(reference.startsWith('assets/') ? '/' + reference : reference, parent);
  assert.equal(url.origin, origin.origin, 'Off-origin asset reference is forbidden');
  assert.match(url.pathname, /^\/assets\/[A-Za-z0-9_-][A-Za-z0-9_.-]*\.(?:js|css)$/);
  return url.pathname;
}

export function classifyComputedImports(content, imports = parse(content)[0]) {
  const knownLoaders = [
    ...content.matchAll(
      /(?:let|var) ([A-Za-z_$][A-Za-z0-9_$]*)=null;const ([A-Za-z_$][A-Za-z0-9_$]*)=(["'\x60])@opentelemetry\/api\3;function ([A-Za-z_$][A-Za-z0-9_$]*)\(\)\{return \1===null&&\(\1=import\(\2\)\.catch\(\(\)=>null\)\),\1\}/g,
    ),
  ];
  const allowedOptionalBareImports = [];
  let unsupportedDynamicImports = 0;
  for (const entry of imports.filter((entry) => entry.d >= 0 && entry.n === undefined)) {
    const known = knownLoaders.some((match) => entry.ss === match.index + match[0].indexOf('import('));
    if (known) {
      allowedOptionalBareImports.push('@opentelemetry/api');
    } else {
      unsupportedDynamicImports++;
    }
  }
  assert.ok(allowedOptionalBareImports.length <= 1, 'Duplicate optional tracing loader requires review');
  return { allowedOptionalBareImports, unsupportedDynamicImports };
}

export function assertOptionalTracingContract(version, appSource) {
  assert.equal(version, '2.110.7', 'Optional tracing exception requires the reviewed pinned SDK');
  assert.ok(
    appSource.includes('client ??= createClient(supabaseUrl!, supabaseAnonKey!, {') && !appSource.includes('tracePropagation'),
    'Application must preserve the reviewed disabled tracing default',
  );
}

export function assetReferences(content) {
  const [imports] = parse(content);
  const references = imports.filter((entry) => typeof entry.n === 'string').map((entry) => entry.n);
  const { allowedOptionalBareImports, unsupportedDynamicImports } = classifyComputedImports(content, imports);
  // Pinned Vite emits this prepend with a literal JSON dependency array.
  // Do not treat arbitrary strings mentioning assets/import/export as modules.
  if (content.startsWith('const __vite__mapDeps=')) {
    const mapped = content.match(
      /^const __vite__mapDeps=\(i,m=__vite__mapDeps,d=\(m\.f\|\|\(m\.f=(\[[^\]\r\n]*\])\)\)\)=>i\.map\(i=>d\[i\]\);/,
    );
    assert.ok(mapped, 'Unsupported Vite mapDeps emission');
    const dependencies = JSON.parse(mapped[1]);
    assert.ok(Array.isArray(dependencies) && dependencies.every((entry) => typeof entry === 'string'), 'Nonliteral Vite mapDeps refused');
    references.push(...dependencies);
  }
  return { references, allowedOptionalBareImports, unsupportedDynamicImports };
}

export async function assetSignature(origin) {
  const base = new URL(origin);
  const read = assetReader(base);
  const html = await read(base, true);
  assert.ok(
    !/<script\b[^>]*\btype\s*=\s*(?:["']\s*importmap\s*["']|importmap(?=[\s>]))/i.test(html.text),
    'HTML import maps are unsupported by the browser asset proof',
  );
  for (const tag of html.text.matchAll(/<script\b([^>]*)>/gi)) {
    const type = tag[1].match(/\btype\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>]+))/i);
    assert.ok(
      !type || ![type[1], type[2], type[3]].filter(Boolean).some((value) => value.includes('&')),
      'Encoded script types are unsupported',
    );
  }
  const entry = [...html.text.matchAll(/(?:src|href)=["']([^"' ]+\.(?:js|css)(?:[?#][^"' ]*)?)["']/g)].map((match) => match[1]);
  assert.ok(entry.length >= 2, 'Application entry assets are missing');
  const pending = [];
  const visited = new Set();
  const counts = { js: 0, css: 0 };
  const enqueue = (reference, parent) => {
    const path = assetPath(reference, parent, base);
    if (visited.has(path)) {
      return;
    }
    visited.add(path);
    const kind = path.endsWith('.js') ? 'js' : 'css';
    assert.ok(++counts[kind] <= assetLimits[kind], 'Asset inventory count limit exceeded');
    pending.push(path);
  };
  for (const reference of entry) {
    enqueue(reference, base);
  }
  const signature = [];
  for (let index = 0; index < pending.length; index++) {
    const path = pending[index];
    const url = new URL(path, base);
    const content = await read(url);
    signature.push({ path, hash: content.hash });
    if (!path.endsWith('.js')) {
      continue;
    }
    const { references, allowedOptionalBareImports, unsupportedDynamicImports } = assetReferences(content.text);
    assert.equal(unsupportedDynamicImports, 0, 'Unresolved computed module import requires operator review');
    if (allowedOptionalBareImports.length) {
      // Pinned SDK defaults tracing off; with no import map this exact bare
      // fallback cannot resolve to a browser URL and its rejection is caught.
      const lock = JSON.parse(readFileSync(new URL('../../package-lock.json', import.meta.url), 'utf8'));
      const app = readFileSync(new URL('../../src/services/cloudSync.ts', import.meta.url), 'utf8');
      assertOptionalTracingContract(lock.packages['node_modules/@supabase/supabase-js']?.version, app);
    }
    for (const reference of references) {
      enqueue(reference, url);
    }
  }
  return signature.sort((a, b) => {
    if (a.path === b.path) {
      return 0;
    }
    return a.path < b.path ? -1 : 1;
  });
}

export async function publishedJavaScript(origin, signature) {
  const base = new URL(origin);
  const read = assetReader(base);
  const assets = signature.filter((asset) => asset.path.endsWith('.js'));
  assert.ok(assets.length > 0 && assets.length <= assetLimits.js, 'JS inventory count limit exceeded');
  let contents = '';
  for (const asset of assets) {
    const path = assetPath(asset.path, base, base);
    const content = await read(new URL(path, base));
    assert.equal(content.hash, asset.hash, 'Published JS changed after inventory');
    contents += content.text;
  }
  return contents;
}

export function assertPublishedBackend(contents, targetUrl, key, hostedUrl) {
  assert.ok(contents.includes(targetUrl) && contents.includes(key), 'Published client must contain the exact target URL and public key');
  assert.ok(!contents.includes(hostedUrl), 'Published client must not retain the Hosted production backend');
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
      await page.locator('.auth-form[aria-busy="false"]').waitFor();
      assert.equal(await page.getByRole('alert').count(), 0, 'Sign-in must initialize without a visible error');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
    }
    for (const path of ['/settings', '/week', '/month', '/events', '/results', '/trends', '/more']) {
      await page.goto(`${origin}${path}`);
      await page.locator('input[type="password"]').waitFor();
      await page.locator('.auth-form[aria-busy="false"]').waitFor();
      assert.equal(await page.getByRole('alert').count(), 0, 'Sign-in must initialize without a visible error');
    }
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
  return assets;
}
