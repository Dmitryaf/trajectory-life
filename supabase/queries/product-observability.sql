-- Operator SQL editor only. No public RPC, dashboard, persistent aggregates or individual exports.
-- Run the whole file in one session. Set exclusions BEFORE interpreting coverage/cohorts.
create or replace temporary view telemetry_report_parameters as
select now() as as_of, array[]::uuid[] as excluded_user_ids;

create or replace temporary view telemetry_eligible_accounts as
select a.id, a.created_at, c.enabled, c.observation_started_at
from auth.users a cross join telemetry_report_parameters p
left join public.product_telemetry_consent c on c.user_id = a.id
where a.created_at <= p.as_of and not (a.id = any(p.excluded_user_ids));

-- Observation starts at the current consent grant, never at inferred signup or imported diary dates.
-- Old cohorts lose W0 under raw retention; exclude them instead of silently treating lost history as zero.
create or replace temporary view telemetry_observed_accounts as
select a.*, case when a.observation_started_at <= a.created_at + interval '1 day'
  then 'consent_near_signup' else 'consent_later' end as consent_timing
from telemetry_eligible_accounts a cross join telemetry_report_parameters p
where a.enabled and a.observation_started_at >= p.as_of - interval '90 days' and a.observation_started_at <= p.as_of;

create or replace temporary view telemetry_observed_events as
select e.*, a.observation_started_at,
  floor(extract(epoch from (e.occurred_at - a.observation_started_at)) / 604800)::integer as observation_week
from public.product_events e join telemetry_observed_accounts a on a.id = e.user_id
cross join telemetry_report_parameters p
where e.occurred_at >= a.observation_started_at and e.occurred_at <= p.as_of;

-- 1. Coverage is not consent rate among everyone who ever saw a screen: exposure is unobserved.
select count(*) as eligible_accounts, count(*) filter (where enabled) as consenting_accounts,
  count(*) filter (where exists (select 1 from public.product_events e where e.user_id = a.id)) as accounts_with_retained_events,
  count(*) filter (where observation_started_at < p.as_of - interval '90 days') as cohorts_without_complete_w0,
  count(*) filter (where enabled)::numeric / nullif(count(*), 0) as consent_coverage
from telemetry_eligible_accounts a cross join telemetry_report_parameters p;

-- 2. Ordered first-use funnel in the first seven observation days, matured accounts only.
create or replace temporary view telemetry_first_use_funnel as
select a.id,
  (select min(occurred_at) from telemetry_observed_events e where e.user_id = a.id and e.event_name = 'first_use_started' and e.observation_week = 0) as started_at,
  a.consent_timing
from telemetry_observed_accounts a cross join telemetry_report_parameters p
where a.observation_started_at + interval '7 days' <= p.as_of;
with stages as (
  select f.*, (select min(occurred_at) from telemetry_observed_events e where e.user_id = f.id and e.event_name = 'first_use_overview_viewed'
    and e.occurred_at >= f.started_at and e.observation_week = 0) as overview_at from telemetry_first_use_funnel f
), completed as (
  select s.*, exists(select 1 from telemetry_observed_events e where e.user_id = s.id and e.event_name = 'first_use_completed'
    and e.occurred_at >= s.overview_at and e.observation_week = 0) as completed from stages s
)
select consent_timing, count(*) as observed_mature_accounts, count(started_at) as started,
  count(overview_at) as overview, count(*) filter (where completed) as completed,
  count(overview_at)::numeric / nullif(count(started_at), 0) as overview_per_start,
  count(*) filter (where completed)::numeric / nullif(count(overview_at), 0) as completion_per_overview
from completed group by consent_timing;

-- 3-5. Separate collection, reflection reach, and explicit reviews/decisions. Repeated saves are NOT distinct diary entries.
with activity as (
  select date_trunc('week', occurred_at at time zone 'UTC') as week_utc, user_id,
    count(*) filter (where event_name = 'daily_entry_saved') as explicit_daily_saves,
    count(distinct (occurred_at at time zone 'UTC')::date) filter (where event_name = 'daily_entry_saved') as days_with_daily_saves,
    bool_or(event_name in ('week_opened', 'month_opened', 'history_opened')) as reflection_reached,
    bool_or(event_name in ('week_review_saved', 'month_review_saved')) as review_saved,
    bool_or(event_name = 'decision_saved') as decision_saved
  from telemetry_observed_events group by 1, 2
)
select week_utc, count(*) as observed_active_accounts,
  count(*) filter (where explicit_daily_saves > 0) as collectors, sum(explicit_daily_saves) as explicit_daily_saves,
  sum(days_with_daily_saves) as account_days_with_daily_saves,
  count(*) filter (where reflection_reached) as reflection_accounts,
  count(*) filter (where review_saved) as review_accounts, count(*) filter (where decision_saved) as decision_accounts,
  count(*) filter (where reflection_reached)::numeric / nullif(count(*), 0) as reflection_per_observed_active
from activity group by week_utc order by week_utc;

-- 6. W0=days 0-6 from consent, W1=7-13, W2=14-20, W4=28-34, W8=56-62.
-- Denominators include only accounts for which the ENTIRE requested window has elapsed.
select a.consent_timing, w.week,
  count(*) as mature_accounts,
  count(*) filter (where exists(select 1 from telemetry_observed_events e where e.user_id = a.id and e.observation_week = w.week)) as returning_accounts,
  count(*) filter (where exists(select 1 from telemetry_observed_events e where e.user_id = a.id and e.observation_week = w.week))::numeric / nullif(count(*), 0) as observed_return_rate
from telemetry_observed_accounts a cross join (values (0), (1), (2), (4), (8)) w(week)
cross join telemetry_report_parameters p
where a.observation_started_at + ((w.week + 1) * interval '7 days') <= p.as_of
group by a.consent_timing, w.week order by a.consent_timing, w.week;

-- 7. Return after an OBSERVED activity gap. Delivery gaps/offline/withdrawal are not proven absence of use.
with visits as (
  select user_id, occurred_at, lag(occurred_at) over(partition by user_id order by occurred_at, id) as previous_at
  from telemetry_observed_events
), eligible as (
  select a.id, gaps.days from telemetry_observed_accounts a cross join (values (14), (30)) gaps(days)
  cross join telemetry_report_parameters p
  where exists(select 1 from telemetry_observed_events e where e.user_id = a.id and e.occurred_at + gaps.days * interval '1 day' <= p.as_of)
)
select days, count(*) as accounts_with_gap_followup,
  count(*) filter (where exists(select 1 from visits v where v.user_id = eligible.id and v.occurred_at - v.previous_at >= days * interval '1 day')) as accounts_returning_after_observed_gap
from eligible group by days order by days;

-- 8. Candidate associations, never causal effects or a chosen activation definition.
-- The 3+ bucket describes available meaningful entries; they may predate consent or come from import.
create or replace temporary view telemetry_activation_candidates as
select a.id, a.consent_timing, candidate.name,
  case candidate.name
    when 'reconstructed_overview' then exists(select 1 from telemetry_observed_events e where e.user_id = a.id and e.observation_week = 0 and e.event_name = 'first_use_overview_viewed')
    when 'three_available_entries_then_week' then exists(
      select 1 from telemetry_observed_events d join telemetry_observed_events w on w.user_id = d.user_id
      where d.user_id = a.id and d.event_name = 'daily_entry_saved' and d.props->>'entry_count_bucket' = '3+'
        and d.observation_week = 0 and w.observation_week = 0 and w.event_name = 'week_opened' and w.occurred_at >= d.occurred_at)
    when 'weekly_review' then exists(select 1 from telemetry_observed_events e where e.user_id = a.id and e.observation_week = 0 and e.event_name = 'week_review_saved')
    when 'explicit_decision' then exists(select 1 from telemetry_observed_events e where e.user_id = a.id and e.observation_week = 0 and e.event_name = 'decision_saved')
  end as candidate_present,
  a.observation_started_at
from telemetry_observed_accounts a cross join (values ('reconstructed_overview'), ('three_available_entries_then_week'), ('weekly_review'), ('explicit_decision')) candidate(name);

select c.consent_timing, c.name, c.candidate_present, w.week, count(*) as mature_accounts,
  count(*) filter (where exists(select 1 from telemetry_observed_events e where e.user_id = c.id and e.observation_week = w.week)) as returning_accounts,
  count(*) filter (where exists(select 1 from telemetry_observed_events e where e.user_id = c.id and e.observation_week = w.week))::numeric / nullif(count(*), 0) as observed_return_rate
from telemetry_activation_candidates c cross join (values (4), (8)) w(week) cross join telemetry_report_parameters p
where c.observation_started_at + ((w.week + 1) * interval '7 days') <= p.as_of
group by c.consent_timing, c.name, c.candidate_present, w.week order by c.name, c.consent_timing, w.week, c.candidate_present;
