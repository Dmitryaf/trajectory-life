import { createClient } from 'npm:@supabase/supabase-js@2';
import { createTelemetryHandler } from './handler.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const client = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
Deno.serve(createTelemetryHandler({
  enabled: Deno.env.get('PRODUCT_TELEMETRY_ENABLED') === 'true',
  allowedOrigins: (Deno.env.get('TELEMETRY_ALLOWED_ORIGINS') ?? '').split(',').map(value => value.trim()).filter(Boolean),
  getUser: async token => {
    const { data, error } = await client.auth.getUser(token);
    return error ? null : data.user;
  },
  process: async (userId, body) => {
    const { data, error } = await client.rpc('process_product_telemetry', {
      p_user_id: userId, p_operation: body.operation, p_revision: body.revision ?? null, p_events: body.events ?? [],
    });
    if (error) { throw new Error('Telemetry unavailable'); }
    return data;
  },
}));
