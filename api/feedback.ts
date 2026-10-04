interface FeedbackRequestBody {
  message?: unknown;
}

interface SupabaseUser {
  id: string;
  email?: string;
}

const maxMessageLength = 4000;

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
    feedbackToEmail: process.env.FEEDBACK_TO_EMAIL,
    feedbackFromEmail: process.env.FEEDBACK_FROM_EMAIL,
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
  return typeof user.id === 'string' ? { id: user.id, email: typeof user.email === 'string' ? user.email : undefined } : null;
}

export async function POST(request: Request): Promise<Response> {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) {
    return json({ error: 'Запрос отклонён' }, 403);
  }

  const env = environment();
  if (!env.supabaseUrl || !env.supabaseAnonKey || !env.resendApiKey || !env.feedbackToEmail || !env.feedbackFromEmail) {
    console.error('Feedback function environment is incomplete');
    return json({ error: 'Форма временно недоступна' }, 503);
  }

  let user: SupabaseUser | null;
  try {
    user = await authenticatedUser(request, env.supabaseUrl, env.supabaseAnonKey);
  } catch {
    console.error('Feedback auth verification failed');
    return json({ error: 'Не удалось проверить сессию. Попробуй позже.' }, 502);
  }
  if (!user) {
    return json({ error: 'Сессия закончилась. Войди снова и повтори отправку.' }, 401);
  }

  let body: FeedbackRequestBody;
  try {
    const input: unknown = await request.json();
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      return json({ error: 'Не удалось прочитать сообщение' }, 400);
    }
    body = input as FeedbackRequestBody;
  } catch {
    return json({ error: 'Не удалось прочитать сообщение' }, 400);
  }

  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (message.length < 3 || message.length > maxMessageLength) {
    return json({ error: `Сообщение должно содержать от 3 до ${maxMessageLength} символов` }, 400);
  }

  const submittedAt = new Date().toISOString();
  const emailText = [
    'Обратная связь из закрытой беты «Траектории»',
    '',
    `Аккаунт: ${user.email || 'email недоступен'}`,
    `Отправлено: ${submittedAt}`,
    '',
    message,
  ].join('\n');

  let delivery: Response;
  try {
    delivery = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.resendApiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': crypto.randomUUID(),
        'User-Agent': 'trajectory-app/0.1',
      },
      body: JSON.stringify({
        from: env.feedbackFromEmail,
        to: [env.feedbackToEmail],
        subject: 'Обратная связь из закрытой беты',
        text: emailText,
      }),
    });
  } catch {
    console.error('Feedback email delivery request failed');
    return json({ error: 'Не удалось отправить сообщение. Попробуй позже.' }, 502);
  }

  if (!delivery.ok) {
    console.error('Feedback email delivery failed', delivery.status);
    return json({ error: 'Не удалось отправить сообщение. Попробуй позже.' }, 502);
  }

  return json({ ok: true }, 200);
}
