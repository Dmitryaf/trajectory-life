-- Apply with the matching frontend and verify the configured Auth hook in staging.
-- Existing users are not assigned a retrospective acceptance.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table private.registration_terms_acceptance (
  user_id uuid primary key references auth.users(id) on delete cascade,
  terms_version text not null,
  privacy_policy_version text not null,
  accepted_at timestamptz not null default now()
);
revoke all on private.registration_terms_acceptance from public, anon, authenticated;

create function private.valid_registration_terms(acceptance jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(acceptance = jsonb_build_object(
    'accepted', true,
    'terms_version', '2026-10-09-v1',
    'privacy_policy_version', '2026-10-09-v1'
  ), false);
$$;
revoke all on function private.valid_registration_terms(jsonb) from public, anon, authenticated;

-- Preserve the configured hook identifier, without restoring invitations or a cohort limit.
create or replace function public.hook_require_beta_invite(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.valid_registration_terms(event->'user'->'user_metadata'->'terms_acceptance') then
    return jsonb_build_object('error', jsonb_build_object(
      'http_code', 400,
      'message', 'Чтобы создать аккаунт, обновите приложение и примите актуальные Условия использования.'
    ));
  end if;
  return '{}'::jsonb;
end;
$$;
revoke all on function public.hook_require_beta_invite(jsonb) from public, anon, authenticated;
grant execute on function public.hook_require_beta_invite(jsonb) to supabase_auth_admin;

create function private.record_registration_terms()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  acceptance jsonb := new.raw_user_meta_data->'terms_acceptance';
begin
  if not private.valid_registration_terms(acceptance) then
    raise exception 'Current terms acceptance is required to create an account' using errcode = '23514';
  end if;
  insert into private.registration_terms_acceptance (user_id, terms_version, privacy_policy_version)
  values (new.id, acceptance->>'terms_version', acceptance->>'privacy_policy_version');
  return new;
end;
$$;
revoke all on function private.record_registration_terms() from public, anon, authenticated;

create trigger record_registration_terms_after_insert
after insert on auth.users
for each row execute function private.record_registration_terms();
