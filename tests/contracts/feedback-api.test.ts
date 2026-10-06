import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '../../api/feedback';
import { sendFeedback } from '@/services/feedback';

const originalEnvironment = { ...process.env };

function request(body: unknown, origin = 'https://app.example.test') {
  return new Request('https://app.example.test/api/feedback', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer valid-session',
      'Content-Type': 'application/json',
      Origin: origin,
    },
    body: JSON.stringify(body),
  });
}

describe('feedback API', () => {
  beforeEach(() => {
    process.env.SUPABASE_URL = 'https://project.supabase.co';
    process.env.SUPABASE_ANON_KEY = 'public-anon-key';
    process.env.RESEND_API_KEY = 'server-secret';
    process.env.FEEDBACK_TO_EMAIL = 'private-inbox@example.test';
    process.env.FEEDBACK_FROM_EMAIL = 'Траектория <feedback@example.test>';
  });

  afterEach(() => {
    process.env = { ...originalEnvironment };
    vi.unstubAllGlobals();
  });

  it('verifies the Supabase session and sends a plain-text email', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ id: 'user-1', email: 'friend@example.test' }))
      .mockResolvedValueOnce(Response.json({ id: 'email-1' }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await POST(request({ message: 'На экране недели не хватает пояснения.' }));

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toBe('https://project.supabase.co/auth/v1/user');
    const delivery = fetchMock.mock.calls[1];
    expect(delivery[0]).toBe('https://api.resend.com/emails');
    const payload = JSON.parse((delivery[1] as RequestInit).body as string) as { to: string[]; text: string; subject: string };
    expect(payload.to).toEqual(['private-inbox@example.test']);
    expect(payload.text).toContain('friend@example.test');
    expect(payload.text).toContain('На экране недели не хватает пояснения.');
    expect(payload.subject).toBe('Обратная связь — Траектория');
    expect(payload.text).not.toMatch(/закрыт.{0,20}бет/i);
  });

  it('rejects cross-origin requests before calling external services', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await POST(request({ message: 'Сообщение' }, 'https://attacker.example.test'));

    expect(response.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects an expired or invalid Supabase session', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response(null, { status: 401 })));

    const response = await POST(request({ message: 'Сообщение' }));

    expect(response.status).toBe(401);
  });

  it.each([null, [], ['message'], true, 1, 'message', {}, { message: 42 }, { message: '  ' }])(
    'rejects malformed message bodies without sending email: %j',
    async (body) => {
      const fetchMock = vi.fn().mockResolvedValueOnce(Response.json({ id: 'user-1' }));
      vi.stubGlobal('fetch', fetchMock);
      expect((await POST(request(body))).status).toBe(400);
      expect(fetchMock).toHaveBeenCalledOnce();
    },
  );
});

describe('feedback browser client', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sends only the message and current access token to the local API', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(Response.json({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    await sendFeedback('Идея для формы', 'session-token');

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/feedback',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer session-token' }),
        body: JSON.stringify({ message: 'Идея для формы' }),
      }),
    );
  });
});
