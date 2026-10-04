interface SupabaseUser {
  id: string;
}

const allowedCodes = new Set(['ACTION_FAILED', 'APP_DATA_LOAD_FAILED', 'UNHANDLED_ERROR', 'UNHANDLED_REJECTION']);
const allowedRoutes = new Set([
  'today',
  'results',
  'events',
  'week',
  'month',
  'trends',
  'more',
  'settings',
  'password-reset',
  'data-policy',
  'unknown',
]);

function json(body: Record<string, unknown>, status: number): Response {
  return Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
}

function environment() {
  return {
    supabaseUrl: process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY,
    resendApiKey: process.env.RESEND_API_KEY,
    errorToEmail: process.env.ERROR_TO_EMAIL || process.env.FEEDBACK_TO_EMAIL,
    errorFromEmail: process.env.ERROR_FROM_EMAIL || process.env.FEEDBACK_FROM_EMAIL,
    deploymentId: process.env.VERCEL_DEPLOYMENT_ID || 'local',
    commitSha: process.env.VERCEL_GIT_COMMIT_SHA || 'unknown',
  };
}

async function authenticatedUser(request: Request, supabaseUrl: string, supabaseAnonKey: string): Promise<SupabaseUser | null> {
  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) {
    return null;
  }

  const response = await fetch(`${supabaseUrl.replace(/\/$/, '')}/auth/v1/user`, {
    headers: {
      apikey: supabaseAnonKey,
      Authorization: authorization,
    },
  });
  if (!response.ok) {
    return null;
  }

  const user = (await response.json()) as Partial<SupabaseUser>;
  return typeof user.id === 'string' ? { id: user.id } : null;
}

function validBody(body: unknown): body is { code: string; route: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return false;
  }
  const record = body as Record<string, unknown>;
  return (
    Object.keys(record).length === 2 &&
    typeof record.code === 'string' &&
    allowedCodes.has(record.code) &&
    typeof record.route === 'string' &&
    allowedRoutes.has(record.route)
  );
}

export async function POST(request: Request): Promise<Response> {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) {
    return json({ error: 'Запрос отклонён' }, 403);
  }

  const env = environment();
  if (!env.supabaseUrl || !env.supabaseAnonKey || !env.resendApiKey || !env.errorToEmail || !env.errorFromEmail) {
    console.error('Client error function environment is incomplete');
    return json({ error: 'Наблюдение временно недоступно' }, 503);
  }

  let user: SupabaseUser | null;
  try {
    user = await authenticatedUser(request, env.supabaseUrl, env.supabaseAnonKey);
  } catch {
    console.error('Client error auth verification failed');
    return json({ error: 'Не удалось проверить сессию' }, 502);
  }
  if (!user) {
    return json({ error: 'Сессия закончилась' }, 401);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Не удалось прочитать событие' }, 400);
  }
  if (!validBody(body)) {
    return json({ error: 'Недопустимый формат события' }, 400);
  }

  const eventId = crypto.randomUUID();
  const submittedAt = new Date().toISOString();
  const emailText = [
    'Техническая ошибка в «Траектории»',
    '',
    `Событие: ${eventId}`,
    `Код: ${body.code}`,
    `Экран: ${body.route}`,
    `Пользователь: ${user.id}`,
    `Время сервера: ${submittedAt}`,
    `Deployment: ${env.deploymentId}`,
    `Commit: ${env.commitSha}`,
    '',
    'Сообщение ошибки, stack trace, URL, поля форм и содержимое записей не собираются.',
  ].join('\n');

  let delivery: Response;
  try {
    delivery = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.resendApiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': eventId,
        'User-Agent': 'trajectory-app/0.1',
      },
      body: JSON.stringify({
        from: env.errorFromEmail,
        to: [env.errorToEmail],
        subject: `[Траектория] ${body.code} · ${body.route}`,
        text: emailText,
      }),
    });
  } catch {
    console.error('Client error email delivery request failed');
    return json({ error: 'Не удалось зарегистрировать событие' }, 502);
  }

  if (!delivery.ok) {
    console.error('Client error email delivery failed', delivery.status);
    return json({ error: 'Не удалось зарегистрировать событие' }, 502);
  }

  return json({ ok: true, eventId }, 200);
}
