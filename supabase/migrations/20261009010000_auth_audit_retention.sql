-- Activation is separate: schedule-auth-audit-retention.sql installs the hourly job.
-- Keep journal content inside Auth; emit only the number of deleted old rows.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create function private.purge_auth_audit()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  deleted_rows integer;
begin
  with expired as (
    select id
    from auth.audit_log_entries
    where created_at < now() - interval '90 days'
    order by created_at, id
    limit 10000
    for update skip locked
  )
  delete from auth.audit_log_entries as audit
  using expired
  where audit.id = expired.id;
  get diagnostics deleted_rows = row_count;
  return deleted_rows;
end;
$$;
revoke all on function private.purge_auth_audit() from public, anon, authenticated, supabase_auth_admin;
grant usage on schema private to supabase_admin;
grant execute on function private.purge_auth_audit() to supabase_admin;
