import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import test from 'node:test';
import { assetSignature } from './smoke.mjs';

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
