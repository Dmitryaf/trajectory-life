-- Applying this migration removes the invite and total-cohort limit from
-- signup, including direct Auth API calls. Apply only during the accepted
-- registration rollout with Supabase signup disabled until verification.
-- Keep the hook identifier so existing Auth configurations remain valid.
create or replace function public.hook_require_beta_invite(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  return '{}'::jsonb;
end;
$$;

revoke all on function public.hook_require_beta_invite(jsonb) from public, anon, authenticated;
grant execute on function public.hook_require_beta_invite(jsonb) to supabase_auth_admin;

-- Legacy private beta configuration and metadata cleanup remain intact.
-- No accounts, snapshots, consent or telemetry data are changed.
