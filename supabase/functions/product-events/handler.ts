import { hasExactKeys, isObject, isProductEvent, isUuid, TELEMETRY_BATCH_LIMIT, TELEMETRY_BODY_LIMIT } from '../../../src/model/productTelemetry.ts';

type Operation = 'status' | 'grant' | 'withdraw' | 'ingest' | 'snooze' | 'offer' | 'reminder';
interface TelemetryRequest { operation: Operation; revision?: string; events?: unknown[] }
export interface TelemetryDependencies {
  enabled: boolean;
  allowedOrigins: string[];
  getUser: (token: string) => Promise<{ id: string } | null>;
  process: (userId: string, body: TelemetryRequest) => Promise<Record<string, unknown>>;
  now?: () => number;
}

function validRequest(body: unknown, now: number): body is TelemetryRequest {
  if (!isObject(body) || typeof body.operation !== 'string') { return false; }
  if (body.operation === 'status' || body.operation === 'withdraw' || body.operation === 'snooze') { return hasExactKeys(body, ['operation']); }
  if (['grant', 'offer', 'reminder'].includes(body.operation)) { return hasExactKeys(body, ['operation', 'revision']) && isUuid(body.revision); }
  return body.operation === 'ingest' && hasExactKeys(body, ['operation', 'revision', 'events']) &&
    isUuid(body.revision) && Array.isArray(body.events) && body.events.length > 0 &&
    body.events.length <= TELEMETRY_BATCH_LIMIT && body.events.every(event => isProductEvent(event, now));
}

async function readBoundedBody(request: Request): Promise<unknown> {
  if (Number(request.headers.get('content-length')) > TELEMETRY_BODY_LIMIT) { throw new Error('body'); }
  const reader = request.body?.getReader();
  if (!reader) { throw new Error('body'); }
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) { break; }
      length += value.length;
      if (length > TELEMETRY_BODY_LIMIT) { await reader.cancel(); throw new Error('body'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}

export function createTelemetryHandler(dependencies: TelemetryDependencies) {
  const now = dependencies.now ?? Date.now;
  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get('origin') ?? '';
    const allowed = dependencies.allowedOrigins.includes(origin);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json', 'Cache-Control': 'no-store', Vary: 'Origin',
      'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
    };
    if (allowed) { headers['Access-Control-Allow-Origin'] = origin; }
    const reply = (data: Record<string, unknown>, status = 200) => new Response(JSON.stringify(data), { status, headers });
    if (!allowed) { return reply({ error: 'origin_denied' }, 403); }
    if (request.method === 'OPTIONS') { return new Response(null, { status: 204, headers }); }
    if (request.method !== 'POST') { return reply({ error: 'method_denied' }, 405); }
    const token = request.headers.get('authorization')?.match(/^Bearer ([^\s]+)$/i)?.[1];
    if (!token) { return reply({ error: 'unauthorized' }, 401); }
    if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') { return reply({ error: 'invalid_request' }, 400); }
    let body: unknown;
    try { body = await readBoundedBody(request); } catch { return reply({ error: 'invalid_request' }, 400); }
    if (!validRequest(body, now())) { return reply({ error: 'invalid_request' }, 400); }
    if (!dependencies.enabled && ['grant', 'ingest', 'offer', 'reminder'].includes(body.operation)) { return reply({ error: 'collection_disabled' }, 503); }
    try {
      const user = await dependencies.getUser(token);
      if (!user) { return reply({ error: 'unauthorized' }, 401); }
      const result = await dependencies.process(user.id, body);
      if (result.status === 429) { headers['Retry-After'] = '60'; }
      return reply(result, typeof result.status === 'number' ? result.status : 200);
    } catch { return reply({ error: 'unavailable' }, 503); }
  };
}
