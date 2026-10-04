import assert from 'node:assert/strict';

export const STAGING_ORIGIN = 'https://trajectory-app-git-develop-trajectory3.vercel.app';

export function requireStaging(origin, confirmed) {
  assert.equal(origin, STAGING_ORIGIN, 'Only the explicitly allowlisted staging origin is permitted');
  assert.equal(confirmed, true, 'Explicit confirmation of disposable test accounts is required');
  return origin;
}

const allowedPaths = new Set([
  '/auth/v1/user',
  '/rest/v1/trajectory_snapshots',
  '/rest/v1/product_events',
  '/rest/v1/product_telemetry_consent',
  '/rest/v1/rpc/process_product_telemetry',
  '/rest/v1/rpc/process_product_telemetry_v1',
  '/functions/v1/product-events',
]);

export function requireRequestPath(path) {
  assert.ok(typeof path === 'string' && path.startsWith('/') && !path.startsWith('//'), 'Only relative API paths are permitted');
  const url = new URL(path, 'https://guard.invalid');
  assert.equal(url.origin, 'https://guard.invalid', 'Absolute or external request URLs are forbidden');
  assert.ok(allowedPaths.has(url.pathname), 'Request outside the scoped staging verification boundary');
  return url.pathname + url.search;
}

export async function connectClient(page, origin, label) {
  requireStaging(origin, true);
  assert.equal(new URL(page.url()).origin, origin, 'Expected a staging tab');
  const pending = page.waitForRequest((request) => new URL(request.url()).pathname === '/rest/v1/trajectory_snapshots', {
    timeout: 30_000,
  });
  await page.goto(`${origin}/settings#data-settings`, { waitUntil: 'domcontentloaded' });
  const observed = await pending;
  const backend = new URL(observed.url()).origin;
  assert.match(backend, /^https:\/\/[a-z0-9]+\.supabase\.co$/, 'Unexpected backend origin');
  let headers = await observed.allHeaders();
  assert.ok(headers.apikey && headers.authorization, 'Expected normal browser credentials');
  const claims = JSON.parse(Buffer.from(headers.authorization.replace(/^Bearer /, '').split('.')[1], 'base64url').toString());
  assert.equal(claims.role, 'authenticated', 'Only ordinary authenticated test users are permitted');

  async function request(method, path, data, { anonymous = false, prefer = 'return=representation', requestOrigin = origin } = {}) {
    assert.ok(headers, 'Staging client has been disposed');
    const requestHeaders = { apikey: headers.apikey, 'Content-Type': 'application/json', Origin: requestOrigin, Prefer: prefer };
    if (!anonymous) {
      requestHeaders.Authorization = headers.authorization;
    }
    const response = await page.request.fetch(backend + requireRequestPath(path), {
      method,
      headers: requestHeaders,
      ...(data === undefined ? {} : { data }),
      timeout: 20_000,
      maxRedirects: 0,
    });
    const text = await response.text();
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      // A proxy/HTML error is not confused with a successful JSON result.
    }
    return { status: response.status(), body };
  }

  const verified = await request('GET', '/auth/v1/user');
  assert.equal(verified.status, 200, 'Auth must verify the active session');
  assert.equal(verified.body.id, claims.sub, 'Auth identity must match the active token');
  return {
    label,
    page,
    origin,
    backend,
    userId: claims.sub,
    request,
    dispose: () => {
      headers = null;
    },
  };
}

export function requireDistinctClients(clients) {
  assert.equal(clients.length, 2, 'Exactly two test users are required');
  assert.notEqual(clients[0].userId, clients[1].userId, 'Two sessions of one user do not prove RLS');
  assert.equal(clients[0].backend, clients[1].backend, 'Both users must belong to the same staging backend');
}

export function responseSummary(response) {
  return {
    status: response.status,
    ...(Array.isArray(response.body) ? { rows: response.body.length } : {}),
    ...(response.body?.code ? { code: response.body.code } : {}),
    ...(response.body?.error ? { error: response.body.error } : {}),
  };
}
