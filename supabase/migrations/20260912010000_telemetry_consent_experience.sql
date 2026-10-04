-- Account preferences are operational state, never pre-consent product events.
alter table public.product_telemetry_consent
  add column decision text not null default 'undecided' check (decision in ('undecided', 'allowed', 'snoozed', 'declined')),
  add column first_offered_at timestamptz,
  add column snoozed_until timestamptz,
  add column reminder_count integer not null default 0 check (reminder_count between 0 and 1);
-- An older disabled account may have withdrawn: never automatically ask it again.
update public.product_telemetry_consent set decision = case when enabled then 'allowed' else 'declined' end;

alter function public.process_product_telemetry(uuid, text, uuid, jsonb) rename to process_product_telemetry_v1;
revoke all on function public.process_product_telemetry_v1(uuid, text, uuid, jsonb) from service_role;

create function public.process_product_telemetry(
  p_user_id uuid, p_operation text, p_revision uuid default null, p_events jsonb default '[]'::jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  c public.product_telemetry_consent%rowtype;
  result jsonb;
  offered boolean := false;
begin
  if p_operation not in ('status', 'grant', 'withdraw', 'ingest', 'snooze', 'offer', 'reminder') then
    return jsonb_build_object('error', 'invalid_request', 'status', 400);
  end if;
  insert into public.product_telemetry_consent(user_id) values (p_user_id) on conflict do nothing;
  select * into c from public.product_telemetry_consent where user_id = p_user_id for update;
  result := public.process_product_telemetry_v1(p_user_id,
    case when p_operation = 'snooze' then 'withdraw' when p_operation in ('offer', 'reminder') then 'status' else p_operation end,
    p_revision, p_events);
  if result ? 'error' or p_operation = 'ingest' then return result; end if;

  if p_operation in ('grant', 'withdraw', 'snooze') then
    update public.product_telemetry_consent set
      decision = case p_operation when 'grant' then 'allowed' when 'snooze' then 'snoozed' else 'declined' end,
      snoozed_until = case when p_operation = 'snooze' then now() + interval '7 days' else null end
    where user_id = p_user_id;
  elsif p_operation in ('offer', 'reminder') then
    if c.revision is distinct from p_revision then
      return jsonb_build_object('error', 'consent_changed', 'status', 409);
    end if;
    if not c.enabled and c.decision in ('undecided', 'snoozed') then
      if p_operation = 'offer' and c.decision = 'undecided' and c.first_offered_at is null then
        update public.product_telemetry_consent set first_offered_at = now() where user_id = p_user_id;
        offered := true;
      elsif p_operation = 'reminder' and c.first_offered_at is not null and c.reminder_count = 0
        and now() >= greatest(c.first_offered_at + interval '7 days', coalesce(c.snoozed_until, c.first_offered_at)) then
        update public.product_telemetry_consent set reminder_count = 1 where user_id = p_user_id;
        offered := true;
      end if;
    end if;
  end if;
  select * into c from public.product_telemetry_consent where user_id = p_user_id;
  return result || jsonb_build_object('decision', c.decision, 'first_offered_at', c.first_offered_at,
    'snoozed_until', c.snoozed_until, 'reminder_count', c.reminder_count, 'offered', offered);
end;
$$;
revoke all on function public.process_product_telemetry(uuid, text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.process_product_telemetry(uuid, text, uuid, jsonb) to service_role;
