export interface DeleteAccountEnvironment {
  supabaseUrl?: string;
  anonKey?: string;
  serviceRoleKey?: string;
}

interface DependencyError {
  code?: string;
}

export interface DeleteAccountDependencies {
  environment: () => DeleteAccountEnvironment;
  getUser: (
    accessToken: string,
    environment: Required<DeleteAccountEnvironment>,
  ) => Promise<{ user: { id: string } | null; error?: DependencyError | null }>;
  deleteUser: (userId: string, environment: Required<DeleteAccountEnvironment>) => Promise<{ error?: DependencyError | null }>;
  logError?: (message: string, details?: Record<string, unknown>) => void;
}

const corsHeaders = {
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Origin': '*',
};

function jsonResponse(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

export function createDeleteAccountHandler(dependencies: DeleteAccountDependencies) {
  const logError = dependencies.logError ?? console.error;

  return async (request: Request): Promise<Response> => {
    if (request.method === 'OPTIONS') {return new Response('ok', { headers: corsHeaders });}
    if (request.method !== 'POST') {return jsonResponse({ error: 'Method not allowed' }, 405);}

    const authorization = request.headers.get('Authorization') ?? '';
    const accessToken = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!accessToken) {return jsonResponse({ error: 'Unauthorized' }, 401);}

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ error: 'Invalid request' }, 400);
    }
    if (!body || typeof body !== 'object' || !('confirmation' in body) || body.confirmation !== 'DELETE_MY_ACCOUNT') {
      return jsonResponse({ error: 'Confirmation required' }, 400);
    }

    const environment = dependencies.environment();
    if (!environment.supabaseUrl || !environment.anonKey || !environment.serviceRoleKey) {
      logError('Required Supabase function secrets are unavailable');
      return jsonResponse({ error: 'Service unavailable' }, 503);
    }
    const configuredEnvironment = environment as Required<DeleteAccountEnvironment>;

    let userResult: Awaited<ReturnType<DeleteAccountDependencies['getUser']>>;
    try {
      userResult = await dependencies.getUser(accessToken, configuredEnvironment);
    } catch {
      logError('Account authentication failed');
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }
    if (userResult.error || !userResult.user) {return jsonResponse({ error: 'Unauthorized' }, 401);}

    let deletionResult: Awaited<ReturnType<DeleteAccountDependencies['deleteUser']>>;
    try {
      deletionResult = await dependencies.deleteUser(userResult.user.id, configuredEnvironment);
    } catch {
      logError('Account deletion failed');
      return jsonResponse({ error: 'Account deletion failed' }, 500);
    }
    if (deletionResult.error) {
      logError('Account deletion failed', { code: deletionResult.error.code });
      return jsonResponse({ error: 'Account deletion failed' }, 500);
    }

    return jsonResponse({ deleted: true }, 200);
  };
}
