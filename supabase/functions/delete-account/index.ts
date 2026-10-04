import { createClient } from 'npm:@supabase/supabase-js@2';
import { createDeleteAccountHandler } from './handler.ts';

const handler = createDeleteAccountHandler({
  environment: () => ({
    supabaseUrl: Deno.env.get('SUPABASE_URL'),
    anonKey: Deno.env.get('SUPABASE_ANON_KEY'),
    serviceRoleKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
  }),
  getUser: async (accessToken, environment) => {
    const authClient = createClient(environment.supabaseUrl, environment.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await authClient.auth.getUser(accessToken);
    return { user: data.user, error };
  },
  deleteUser: async (userId, environment) => {
    const adminClient = createClient(environment.supabaseUrl, environment.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    return adminClient.auth.admin.deleteUser(userId);
  },
  logError: (message, details) => console.error(message, details ?? ''),
});

Deno.serve(handler);
