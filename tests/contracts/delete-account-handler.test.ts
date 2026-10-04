import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createDeleteAccountHandler,
  type DeleteAccountDependencies,
  type DeleteAccountEnvironment,
} from '../../supabase/functions/delete-account/handler';

const completeEnvironment: Required<DeleteAccountEnvironment> = {
  supabaseUrl: 'https://project.supabase.co',
  anonKey: 'public-anon-key',
  serviceRoleKey: 'server-secret',
};

function request(body: unknown = { confirmation: 'DELETE_MY_ACCOUNT' }, authorization = 'Bearer valid-session') {
  return new Request('https://project.supabase.co/functions/v1/delete-account', {
    method: 'POST',
    headers: {
      Authorization: authorization,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

function createDependencies(environment: DeleteAccountEnvironment = completeEnvironment) {
  return {
    environment: vi.fn(() => environment),
    getUser: vi.fn().mockResolvedValue({ user: { id: 'verified-user' }, error: null }),
    deleteUser: vi.fn().mockResolvedValue({ error: null }),
    logError: vi.fn(),
  } satisfies DeleteAccountDependencies;
}

describe('delete-account handler', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects a request without a bearer token before reading privileged configuration', async () => {
    const dependencies = createDependencies();
    const response = await createDeleteAccountHandler(dependencies)(request(undefined, ''));

    expect(response.status).toBe(401);
    expect(dependencies.environment).not.toHaveBeenCalled();
    expect(dependencies.getUser).not.toHaveBeenCalled();
    expect(dependencies.deleteUser).not.toHaveBeenCalled();
  });

  it('requires the exact destructive-action confirmation', async () => {
    const dependencies = createDependencies();
    const response = await createDeleteAccountHandler(dependencies)(request({ confirmation: 'delete' }));

    expect(response.status).toBe(400);
    expect(dependencies.getUser).not.toHaveBeenCalled();
    expect(dependencies.deleteUser).not.toHaveBeenCalled();
  });

  it('fails closed when a required server secret is unavailable', async () => {
    const dependencies = createDependencies({ ...completeEnvironment, serviceRoleKey: undefined });
    const response = await createDeleteAccountHandler(dependencies)(request());

    expect(response.status).toBe(503);
    expect(dependencies.getUser).not.toHaveBeenCalled();
    expect(dependencies.deleteUser).not.toHaveBeenCalled();
  });

  it('does not call the admin API for an invalid session', async () => {
    const dependencies = createDependencies();
    dependencies.getUser.mockResolvedValue({ user: null, error: { code: 'bad_jwt' } });
    const response = await createDeleteAccountHandler(dependencies)(request());

    expect(response.status).toBe(401);
    expect(dependencies.deleteUser).not.toHaveBeenCalled();
  });

  it('returns an error when the admin API refuses deletion', async () => {
    const dependencies = createDependencies();
    dependencies.deleteUser.mockResolvedValue({ error: { code: 'database_error' } });
    const response = await createDeleteAccountHandler(dependencies)(request());

    expect(response.status).toBe(500);
    expect(dependencies.logError).toHaveBeenCalledWith('Account deletion failed', { code: 'database_error' });
  });

  it('deletes only the user id returned by token verification', async () => {
    const dependencies = createDependencies();
    const response = await createDeleteAccountHandler(dependencies)(
      request({ confirmation: 'DELETE_MY_ACCOUNT', userId: 'requested-other-user' }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ deleted: true });
    expect(dependencies.getUser).toHaveBeenCalledWith('valid-session', completeEnvironment);
    expect(dependencies.deleteUser).toHaveBeenCalledWith('verified-user', completeEnvironment);
    expect(dependencies.deleteUser).not.toHaveBeenCalledWith('requested-other-user', expect.anything());
  });

  it('rejects malformed JSON without authenticating or deleting anyone', async () => {
    const dependencies = createDependencies();
    const malformedRequest = new Request('https://project.supabase.co/functions/v1/delete-account', {
      method: 'POST',
      headers: { Authorization: 'Bearer valid-session', 'Content-Type': 'application/json' },
      body: '{',
    });
    const response = await createDeleteAccountHandler(dependencies)(malformedRequest);

    expect(response.status).toBe(400);
    expect(dependencies.getUser).not.toHaveBeenCalled();
    expect(dependencies.deleteUser).not.toHaveBeenCalled();
  });
});
