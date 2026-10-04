// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('client error monitoring', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ ok: true })));
    window.history.replaceState(null, '', '/settings?draft=private#section');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends only an allowlisted code and normalized route', async () => {
    const { configureErrorMonitoring, reportClientError } = await import('../errorMonitoring');
    const stop = configureErrorMonitoring(() => 'session-token');

    reportClientError('ACTION_FAILED');

    expect(fetch).toHaveBeenCalledWith(
      '/api/client-error',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer session-token' }),
        body: JSON.stringify({ code: 'ACTION_FAILED', route: 'settings' }),
      }),
    );
    expect(JSON.stringify(vi.mocked(fetch).mock.calls)).not.toContain('private');
    stop();
  });

  it('does not send duplicate events from the same route during the cooldown', async () => {
    const { configureErrorMonitoring, reportClientError } = await import('../errorMonitoring');
    const stop = configureErrorMonitoring(() => 'session-token');

    reportClientError('APP_DATA_LOAD_FAILED');
    reportClientError('APP_DATA_LOAD_FAILED');

    expect(fetch).toHaveBeenCalledTimes(1);
    stop();
  });

  it('does not observe or send anything while disabled or signed out', async () => {
    const { configureErrorMonitoring, reportClientError } = await import('../errorMonitoring');
    const stop = configureErrorMonitoring(() => 'session-token', false);

    window.dispatchEvent(new ErrorEvent('error', { message: 'private text' }));
    reportClientError('ACTION_FAILED');

    expect(fetch).not.toHaveBeenCalled();
    stop();

    const stopSignedOut = configureErrorMonitoring(() => '');
    reportClientError('ACTION_FAILED');
    expect(fetch).not.toHaveBeenCalled();
    stopSignedOut();
  });

  it('turns unhandled failures into a fixed code without reading their text', async () => {
    const { configureErrorMonitoring } = await import('../errorMonitoring');
    const stop = configureErrorMonitoring(() => 'session-token');

    window.dispatchEvent(new ErrorEvent('error', { message: 'private form value' }));

    const request = vi.mocked(fetch).mock.calls[0];
    expect(request?.[1]?.body).toBe(JSON.stringify({ code: 'UNHANDLED_ERROR', route: 'settings' }));
    expect(JSON.stringify(request)).not.toContain('private form value');
    stop();
  });
});
