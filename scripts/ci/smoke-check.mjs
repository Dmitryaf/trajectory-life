import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import test from 'node:test';
import {
  assetLimits,
  assetReferences,
  assetSignature,
  assertOptionalTracingContract,
  assertPublishedBackend,
  classifyComputedImports,
  publishedJavaScript,
} from './smoke.mjs';

for (const redacted of [false, true]) {
  test(`public asset verification ${redacted ? 'rejects redacted configuration' : 'accepts readable configuration'}`, async () => {
    const server = createServer((request, response) => {
      response.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
      if (request.url === '/assets/app.js') {
        response.setHeader('Content-Type', 'application/javascript');
        response.end(`const backend = "${redacted ? '[SENSITIVE]' : 'https://example.supabase.co'}";`);
      } else if (request.url === '/assets/app.css') {
        response.setHeader('Content-Type', 'text/css');
        response.end('body { margin: 0 }');
      } else {
        response.setHeader('Content-Type', 'text/html');
        response.end('<script src="/assets/app.js"></script><link href="/assets/app.css" rel="stylesheet">');
      }
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    try {
      const origin = `http://127.0.0.1:${server.address().port}`;
      if (redacted) {
        await assert.rejects(assetSignature(origin), /redacted build configuration/);
      } else {
        assert.equal((await assetSignature(origin)).length, 2);
      }
    } finally {
      await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    }
  });
}

async function withAssets(files, action) {
  const requests = [];
  const server = createServer((request, response) => {
    requests.push(request.url);
    response.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
    const file = files[request.url];
    if (file === undefined) {
      response.writeHead(404);
      response.end();
      return;
    }
    let contentType = request.url === '/' ? 'text/html' : 'text/css';
    if (request.url.endsWith('.js')) {
      contentType = 'application/javascript';
    }
    response.setHeader('Content-Type', contentType);
    response.end(file);
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    await action('http://127.0.0.1:' + server.address().port, requests);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
}
const mapDeps = (refs) => 'const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=' + JSON.stringify(refs) + ')))=>i.map(i=>d[i]);';
const entryHtml = '<script src="/assets/app.js"></script><link href="/assets/app.css" rel="stylesheet">';
const baseFiles = (js) => ({ '/': entryHtml, '/assets/app.js': js, '/assets/app.css': 'body{}' });
test('inventory follows literal static/lazy imports, Vite mapDeps CSS and cycles without evaluating JS or CSS URLs', async () => {
  const files = {
    ...baseFiles(
      mapDeps(['assets/mapped.js', 'assets/lazy.css']) +
        'import"./static.js";import("./lazy.js");throw new Error("MUST_NOT_RUN");const x={"from":"not-a-module"};',
    ),
    '/assets/static.js': 'export { value } from "./mapped.js";',
    '/assets/lazy.js': 'import"./app.js";export const lazy=true;',
    '/assets/mapped.js': 'export const value=1;',
    '/assets/lazy.css': 'body{background:url("https://external.example.invalid/image.js")}',
  };
  await withAssets(files, async (origin, requests) => {
    const signature = await assetSignature(origin);
    assert.deepEqual(
      signature.map((asset) => asset.path),
      Object.keys(files)
        .filter((path) => path !== '/')
        .sort(),
    );
    assert.equal(new Set(requests).size, requests.length);
    assert.equal(requests.length, 7);
    assert.ok(signature.every((asset) => /^[a-f0-9]{64}$/.test(asset.hash)));
  });
});
const backend = 'https://api.example.invalid';
const hostedBackend = 'https://hosted.example.invalid';
const publicKey = 'sb_publishable_synthetic';
for (const failure of [null, 'missing-key', 'hosted-in-lazy']) {
  test('backend proof scans lazy JS: ' + (failure || 'exact key accepted'), async () => {
    const files = {
      ...baseFiles('const url="' + backend + '";import("./lazy.js");'),
      '/assets/lazy.js':
        failure === 'missing-key'
          ? 'export const ready=true;'
          : 'const key="' + publicKey + '";' + (failure === 'hosted-in-lazy' ? 'const old="' + hostedBackend + '";' : ''),
    };
    await withAssets(files, async (origin) => {
      const signature = await assetSignature(origin);
      const contents = await publishedJavaScript(origin, signature);
      if (failure) {
        assert.throws(() => assertPublishedBackend(contents, backend, publicKey, hostedBackend));
      } else {
        assert.doesNotThrow(() => assertPublishedBackend(contents, backend, publicKey, hostedBackend));
      }
    });
  });
}
for (const reference of [
  'https://external.example.invalid/asset.js',
  '//external.example.invalid/asset.js',
  '../outside.js',
  '/outside.js',
  './%2e%2e/asset.js',
  './asset.js?x=1',
  './asset.js#x',
  'data:text/javascript,export default 1',
  'node:fs',
]) {
  test('inventory refuses unsafe/unsupported literal import: ' + reference, async () => {
    await withAssets(baseFiles('import("' + reference + '");'), async (origin, requests) => {
      await assert.rejects(assetSignature(origin), /literal flat Vite asset/);
      assert.ok(requests.every((path) => ['/', '/assets/app.js', '/assets/app.css'].includes(path)));
    });
  });
}
test('JS changed between inventory and backend proof is refused', async () => {
  const files = baseFiles('export const original=true;');
  await withAssets(files, async (origin) => {
    const signature = await assetSignature(origin);
    files['/assets/app.js'] = 'export const replaced=true;';
    await assert.rejects(publishedJavaScript(origin, signature), /changed after inventory/);
  });
});
for (const kind of ['js', 'css']) {
  test(kind + ' inventory limit refuses before fetching excess modules', async () => {
    const refs = Array.from({ length: assetLimits[kind] }, (_, n) => 'assets/extra-' + n + '.' + kind);
    await withAssets(baseFiles(mapDeps(refs)), async (origin, requests) => {
      await assert.rejects(assetSignature(origin), /count limit/);
      assert.equal(requests.length, 2);
    });
  });
}
test('per-asset and aggregate streamed body limits are enforced', async () => {
  await withAssets(baseFiles('x'.repeat(assetLimits.assetBytes + 1)), async (origin) => {
    await assert.rejects(assetSignature(origin), /body size limit/);
  });
  const mapped = mapDeps(['assets/b.js', 'assets/c.js', 'assets/d.js']);
  const files = baseFiles(mapped + ' '.repeat(assetLimits.assetBytes - mapped.length));
  for (const name of ['b', 'c', 'd']) {
    files['/assets/' + name + '.js'] = ' '.repeat(assetLimits.assetBytes);
  }
  await withAssets(files, async (origin) => {
    await assert.rejects(assetSignature(origin), /aggregate size limit/);
  });
});
test('inventory sends GET with omitted credentials, redirect refusal and a bounded abort signal', async (t) => {
  const files = baseFiles('export const ready=true;');
  const seen = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    seen.push(options);
    assert.equal(options.method, 'GET');
    assert.equal(options.credentials, 'omit');
    assert.equal(options.redirect, 'error');
    assert.ok(options.signal instanceof AbortSignal);
    const path = new URL(url).pathname;
    let contentType = path === '/' ? 'text/html' : 'text/css';
    if (path.endsWith('.js')) {
      contentType = 'application/javascript';
    }
    return new Response(files[path], {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'must-revalidate',
      },
    });
  });
  assert.equal((await assetSignature('https://synthetic.example.invalid')).length, 2);
  assert.equal(seen.length, 3);
});
test('overall elapsed deadline prevents the next request', async (t) => {
  let now = 1000;
  t.mock.method(Date, 'now', () => now);
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    calls++;
    now += assetLimits.totalMs + 1;
    return new Response(entryHtml, { headers: { 'Content-Type': 'text/html', 'Cache-Control': 'must-revalidate' } });
  });
  await assert.rejects(assetSignature('https://synthetic.example.invalid'), /deadline/);
  assert.equal(calls, 1);
});
test('HTTP redirects and stalled body aborts are refused by the inventory', async (t) => {
  t.mock.method(
    globalThis,
    'fetch',
    async () => new Response(null, { status: 302, headers: { Location: 'https://external.example.invalid' } }),
  );
  await assert.rejects(assetSignature('https://synthetic.example.invalid'), /request failed/);
  t.mock.restoreAll();
  const timeout = AbortSignal.timeout;
  t.mock.method(AbortSignal, 'timeout', (ms) => timeout(Math.min(ms, 10)));
  t.mock.method(
    globalThis,
    'fetch',
    async (_url, options) =>
      new Response(
        new ReadableStream({
          start(controller) {
            options.signal.addEventListener('abort', () => controller.error(new Error('synthetic body aborted')), { once: true });
          },
        }),
        { headers: { 'Content-Type': 'text/html', 'Cache-Control': 'must-revalidate' } },
      ),
  );
  const keepAlive = setInterval(() => {}, 100);
  try {
    await assert.rejects(assetSignature('https://synthetic.example.invalid'), /aborted/);
  } finally {
    clearInterval(keepAlive);
  }
});

test('module lexer ignores quoted keywords, comments, regex and unrelated asset-looking strings', () => {
  const source = [
    'const kind="import";const other="x";const label="export";',
    'const text="assets/not-a-dependency.js";',
    '// import("./not-real.js")',
    'const regex=/import\\(".+"/;',
    'const meta=import.meta.url;',
    'import /* comment */ ("./lazy.js");export { value } from "./static.js";',
  ].join('\n');
  assert.deepEqual(assetReferences(source), {
    references: ['./lazy.js', './static.js'],
    allowedOptionalBareImports: [],
    unsupportedDynamicImports: 0,
  });
});
test('nonliteral dynamic imports are reported without evaluation or invented dependencies', () => {
  const parsed = assetReferences('const name="./not-literal.js";import(name);const url=import.meta.url;');
  assert.deepEqual(parsed, { references: [], allowedOptionalBareImports: [], unsupportedDynamicImports: 1 });
});
test('inventory handles representative actual 56JS/43CSS Vite mapDeps without the old 40CSS refusal', async () => {
  const js = Array.from({ length: 56 }, (_, n) => 'assets/module-' + n + '.js');
  const css = Array.from({ length: 43 }, (_, n) => 'assets/component-' + n + '.css');
  const files = baseFiles(mapDeps([...js, ...css]) + 'const kind="import";const other="x";');
  for (const ref of js) {
    files['/' + ref] = 'export const ready=true;';
  }
  for (const ref of css) {
    files['/' + ref] = 'body{}';
  }
  await withAssets(files, async (origin, requests) => {
    const signature = await assetSignature(origin);
    assert.equal(signature.filter((asset) => asset.path.endsWith('.js')).length, 57);
    assert.equal(signature.filter((asset) => asset.path.endsWith('.css')).length, 44);
    assert.equal(signature.length, 101);
    assert.equal(requests.length, 102);
    assert.deepEqual(
      signature.map((asset) => asset.path),
      Object.keys(files)
        .filter((ref) => ref !== '/')
        .sort(),
    );
  });
});
test('unknown/nonliteral Vite mapDeps emission is refused rather than silently omitted', () => {
  assert.throws(() => assetReferences('const __vite__mapDeps=(i)=>external[i];'), /Unsupported Vite mapDeps/);
  assert.throws(() => assetReferences(mapDeps([null])), /Nonliteral Vite mapDeps/);
});

const optionalOtel =
  'let cached=null;const pkg="@opentelemetry/api";function load(){return cached===null&&(cached=import(pkg).catch(()=>null)),cached}';
test('exact pinned optional bare OTEL loader is classified and accepted without evaluating JS', async () => {
  assert.deepEqual(classifyComputedImports(optionalOtel), {
    allowedOptionalBareImports: ['@opentelemetry/api'],
    unsupportedDynamicImports: 0,
  });
  await withAssets(baseFiles(optionalOtel), async (origin, requests) => {
    assert.equal((await assetSignature(origin)).length, 2);
    assert.equal(requests.length, 3);
  });
});
for (const [name, change] of [
  ['constant changed to URL', (source) => source.replace('@opentelemetry/api', 'https://external.example.invalid/module.js')],
  ['catch changed', (source) => source.replace('()=>null', '()=>true')],
  ['missing constant binding', (source) => source.replace('const pkg="@opentelemetry/api";', '')],
  ['loader accepts shadowing parameter', (source) => source.replace('function load()', 'function load(pkg)')],
  ['memo guard changed', (source) => source.replace('cached===null', 'cached!==null')],
]) {
  test('computed import refuses changed optional loader: ' + name, async () => {
    const source = change(optionalOtel);
    assert.equal(classifyComputedImports(source).unsupportedDynamicImports, 1);
    await withAssets(baseFiles(source), async (origin) => {
      await assert.rejects(assetSignature(origin), /Unresolved computed module import/);
    });
  });
}
test('arbitrary computed import is refused instead of silently skipped', async () => {
  await withAssets(baseFiles('const name="./hidden.js";import(name);'), async (origin) => {
    await assert.rejects(assetSignature(origin), /Unresolved computed module import/);
  });
});
for (const type of ['"importmap"', "'IMPORTMAP'", 'importmap', '"import&#109;ap"']) {
  test('HTML importmap/ambiguous encoded script type refuses before optional-loader exclusion: ' + type, async () => {
    const files = baseFiles(optionalOtel);
    files['/'] = '<script type=' + type + '>{}</script>' + entryHtml;
    await withAssets(files, async (origin, requests) => {
      await assert.rejects(assetSignature(origin), /import maps|Encoded script types/);
      assert.equal(requests.length, 1);
    });
  });
}
test('optional tracing exception requires pinned SDK and unchanged disabled application default', () => {
  const source = 'client ??= createClient(supabaseUrl!, supabaseAnonKey!, {global:{}});';
  assert.doesNotThrow(() => assertOptionalTracingContract('2.110.7', source));
  assert.throws(() => assertOptionalTracingContract('2.110.8', source));
  assert.throws(() => assertOptionalTracingContract('2.110.7', source + 'tracePropagation:{enabled:true}'));
  assert.throws(() => assertOptionalTracingContract('2.110.7', 'other constructor'));
});

test('quoted optional loader text cannot authorize a different computed import', () => {
  const source = 'const text=' + JSON.stringify(optionalOtel) + ';const name="./hidden.js";import(name);';
  assert.deepEqual(classifyComputedImports(source), { allowedOptionalBareImports: [], unsupportedDynamicImports: 1 });
});
test('duplicate optional loaders require renewed review', () => {
  const second = optionalOtel.replaceAll('cached', 'secondCache').replaceAll('pkg', 'secondPkg').replaceAll('load', 'secondLoad');
  assert.throws(() => classifyComputedImports(optionalOtel + ';' + second), /Duplicate optional tracing loader/);
});
