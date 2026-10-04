-- Private first-party telemetry. Browser roles have no direct table or RPC access.
create table public.product_telemetry_consent (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default false,
  revision uuid not null default gen_random_uuid(),
  policy_version integer not null default 1 check (policy_version = 1),
  observation_started_at timestamptz,
  updated_at timestamptz not null default now(),
  rate_window timestamptz not null default now(),
  rate_count integer not null default 0
);
create table public.product_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_id uuid not null,
  event_name text not null check (event_name in (
    'app_opened', 'first_use_started', 'first_use_completed', 'first_use_overview_viewed',
    'daily_entry_saved', 'week_opened', 'week_review_saved', 'month_opened', 'month_review_saved',
    'history_opened', 'journal_opened', 'decision_saved', 'experiment_started'
  )),
  schema_version integer not null check (schema_version = 1),
  occurred_at timestamptz not null,
  received_at timestamptz not null default now(),
  app_version text not null check (length(app_version) <= 24),
  platform text not null check (platform in ('web', 'ios', 'android')),
  props jsonb not null check (jsonb_typeof(props) = 'object' and octet_length(props::text) <= 256),
  unique (user_id, event_id)
);
create index product_events_user_time on public.product_events(user_id, occurred_at);
create index product_events_retention on public.product_events(received_at);
alter table public.product_telemetry_consent enable row level security;
alter table public.product_events enable row level security;
revoke all on public.product_telemetry_consent, public.product_events from public, anon, authenticated;
revoke all on sequence public.product_events_id_seq from public, anon, authenticated;

-- One row lock serializes ingestion, revocation and compare-and-swap consent changes.
-- Only the Edge function's verified user id reaches this service-role-only function.
create function public.process_product_telemetry(
  p_user_id uuid, p_operation text, p_revision uuid default null, p_events jsonb default '[]'::jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  c public.product_telemetry_consent%rowtype;
  e jsonb;
begin
  if p_operation not in ('status', 'grant', 'withdraw', 'ingest') then
    return jsonb_build_object('error', 'invalid_request', 'status', 400);
  end if;
  insert into public.product_telemetry_consent(user_id) values (p_user_id) on conflict do nothing;
  select * into c from public.product_telemetry_consent where user_id = p_user_id for update;

  if p_operation = 'withdraw' then
    -- Withdrawal is unconditional and never rate limited; delayed grants have stale revisions.
    delete from public.product_events where user_id = p_user_id;
    update public.product_telemetry_consent set enabled = false, revision = gen_random_uuid(),
      observation_started_at = null, updated_at = now() where user_id = p_user_id returning * into c;
  else
    if c.rate_window <= now() - interval '1 minute' then
      c.rate_count := 0;
      c.rate_window := now();
    end if;
    if c.rate_count >= 30 then
      return jsonb_build_object('error', 'rate_limited', 'status', 429);
    end if;
    update public.product_telemetry_consent set rate_window = c.rate_window, rate_count = c.rate_count + 1 where user_id = p_user_id;
    if p_operation in ('grant', 'ingest') and c.revision is distinct from p_revision then
      return jsonb_build_object('error', 'consent_changed', 'status', 409);
    end if;
    if p_operation = 'grant' and not c.enabled then
      update public.product_telemetry_consent set enabled = true, revision = gen_random_uuid(),
        observation_started_at = now(), updated_at = now() where user_id = p_user_id returning * into c;
    end if;
    if p_operation = 'ingest' then
      if not c.enabled then
        return jsonb_build_object('error', 'consent_required', 'status', 403);
      end if;
      if jsonb_typeof(p_events) <> 'array' or jsonb_array_length(p_events) not between 1 and 20 or octet_length(p_events::text) > 16384 then
        return jsonb_build_object('error', 'invalid_batch', 'status', 400);
      end if;
      for e in select value from jsonb_array_elements(p_events) loop
        if (e->>'occurred_at')::timestamptz < greatest(c.observation_started_at, now() - interval '7 days')
          or (e->>'occurred_at')::timestamptz > now() + interval '5 minutes' then
          return jsonb_build_object('error', 'invalid_time', 'status', 400);
        end if;
      end loop;
      insert into public.product_events(user_id, event_id, event_name, schema_version, occurred_at, app_version, platform, props)
        select p_user_id, (value->>'event_id')::uuid, value->>'event_name', (value->>'schema_version')::integer,
          (value->>'occurred_at')::timestamptz, value->>'app_version', value->>'platform', value->'props'
        from jsonb_array_elements(p_events) on conflict (user_id, event_id) do nothing;
      return jsonb_build_object('accepted', (select jsonb_agg(value->>'event_id') from jsonb_array_elements(p_events)));
    end if;
  end if;
  return jsonb_build_object('enabled', c.enabled, 'revision', c.revision, 'policy_version', c.policy_version,
    'observation_started_at', c.observation_started_at, 'server_time', clock_timestamp());
end;
$$;
revoke all on function public.process_product_telemetry(uuid, text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.process_product_telemetry(uuid, text, uuid, jsonb) to service_role;

create function public.purge_product_events() returns bigint
language plpgsql security definer set search_path = '' as $$
declare removed bigint;
begin
  delete from public.product_events where received_at < now() - interval '90 days' or occurred_at < now() - interval '90 days';
  get diagnostics removed = row_count;
  return removed;
end;
$$;
revoke all on function public.purge_product_events() from public, anon, authenticated;
grant execute on function public.purge_product_events() to service_role;
