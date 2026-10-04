create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create extension if not exists pgcrypto with schema extensions;

create table if not exists private.beta_signup_config (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false,
  invite_code_hash text,
  max_signups smallint not null default 15 check (max_signups between 1 and 100),
  signup_count smallint not null default 0 check (signup_count between 0 and max_signups),
  updated_at timestamptz not null default now()
);

insert into private.beta_signup_config (singleton)
values (true)
on conflict (singleton) do nothing;

create or replace function private.configure_beta_signup(
  invite_code text,
  signup_limit integer default 15,
  is_enabled boolean default true
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if signup_limit < 1 or signup_limit > 100 then
    raise exception 'signup_limit must be between 1 and 100';
  end if;

  if is_enabled and length(trim(coalesce(invite_code, ''))) < 10 then
    raise exception 'invite_code must contain at least 10 characters';
  end if;

  update private.beta_signup_config
  set
    enabled = is_enabled,
    invite_code_hash = case
      when is_enabled then extensions.crypt(trim(invite_code), extensions.gen_salt('bf'))
      else null
    end,
    max_signups = signup_limit,
    signup_count = 0,
    updated_at = now()
  where singleton;
end;
$$;

revoke all on function private.configure_beta_signup(text, integer, boolean) from public, anon, authenticated;

create or replace function public.hook_require_beta_invite(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  config private.beta_signup_config%rowtype;
  provided_code text;
begin
  provided_code := trim(coalesce(event->'user'->'user_metadata'->>'beta_invite_code', ''));

  select *
  into config
  from private.beta_signup_config
  where singleton
  for update;

  if not found or not config.enabled then
    return jsonb_build_object(
      'error', jsonb_build_object(
        'http_code', 403,
        'message', 'Регистрация временно закрыта.'
      )
    );
  end if;

  if config.signup_count >= config.max_signups then
    return jsonb_build_object(
      'error', jsonb_build_object(
        'http_code', 403,
        'message', 'Набор участников завершён.'
      )
    );
  end if;

  if provided_code = ''
    or config.invite_code_hash is null
    or extensions.crypt(provided_code, config.invite_code_hash) is distinct from config.invite_code_hash then
    return jsonb_build_object(
      'error', jsonb_build_object(
        'http_code', 403,
        'message', 'Код приглашения не подошёл.'
      )
    );
  end if;

  update private.beta_signup_config
  set signup_count = signup_count + 1, updated_at = now()
  where singleton;

  return '{}'::jsonb;
end;
$$;

revoke all on function public.hook_require_beta_invite(jsonb) from public, anon, authenticated;
grant execute on function public.hook_require_beta_invite(jsonb) to supabase_auth_admin;

create or replace function private.strip_beta_invite_metadata()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.raw_user_meta_data := coalesce(new.raw_user_meta_data, '{}'::jsonb) - 'beta_invite_code';
  return new;
end;
$$;

revoke all on function private.strip_beta_invite_metadata() from public, anon, authenticated;

drop trigger if exists strip_beta_invite_metadata_before_insert on auth.users;
create trigger strip_beta_invite_metadata_before_insert
before insert on auth.users
for each row
execute function private.strip_beta_invite_metadata();
