import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '../../api/client-error';

const originalEnvironment = { ...process.env };

function request(body: unknown, origin = 'https://app.example.test') {
  return new Request('https://app.example.test/api/client-error', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer valid-session',
      'Content-Type': 'application/json',
      Origin: origin,
    },
    body: JSON.stringify(body),
  });
}

describe('client error API', () => {
  beforeEach(() => {
    process.env.SUPABASE_URL = 'https://project.supabase.co';
    process.env.SUPABASE_ANON_KEY = 'public-anon-key';
    process.env.RESEND_API_KEY = 'server-secret';
    process.env.ERROR_TO_EMAIL = 'private-inbox@example.test';
    process.env.ERROR_FROM_EMAIL = 'Траектория <errors@example.test>';
    process.env.VERCEL_DEPLOYMENT_ID = 'deployment-1';
    process.env.VERCEL_GIT_COMMIT_SHA = 'abc123';
  });

  afterEach(() => {
    process.env = { ...originalEnvironment };
    vi.unstubAllGlobals();
  });

  it('sends only allowlisted operational metadata', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ id: 'user-1' }))
      .mockResolvedValueOnce(Response.json({ id: 'email-1' }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await POST(request({ code: 'ACTION_FAILED', route: 'settings' }));

    expect(response.status).toBe(200);
    const delivery = fetchMock.mock.calls[1];
    const payload = JSON.parse((delivery[1] as RequestInit).body as string) as { text: string };
    expect(payload.text).toContain('Код: ACTION_FAILED');
    expect(payload.text).toContain('Экран: settings');
    expect(payload.text).toContain('Пользователь: user-1');
    expect(payload.text).toContain('Deployment: deployment-1');
    expect(payload.text).not.toContain('friend@example.test');
  });

  it.each([
    { code: 'ACTION_FAILED', route: 'settings', message: 'личная запись' },
    { code: 'UNKNOWN_CODE', route: 'settings' },
    { code: 'ACTION_FAILED', route: '/settings?note=личная-запись' },
  ])('rejects data outside the allowlist', async (body) => {
    const fetchMock = vi.fn().mockResolvedValueOnce(Response.json({ id: 'user-1' }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await POST(request(body));

    expect(response.status).toBe(400);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects cross-origin requests before authentication', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await POST(request({ code: 'ACTION_FAILED', route: 'settings' }, 'https://attacker.example.test'));

    expect(response.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
