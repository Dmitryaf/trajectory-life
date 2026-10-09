-- Read-only operator check. No audit payloads, IP addresses or user identifiers.
select
  count(*) as total_rows,
  count(*) filter (where created_at < now() - interval '90 days') as expired_rows,
  count(*) filter (where created_at is null) as undated_rows,
  min(created_at) as oldest_created_at
from auth.audit_log_entries;

select jobname, schedule, active
from cron.job
where jobname = 'purge-auth-audit';

select details.status, details.start_time, details.end_time
from cron.job_run_details as details
join cron.job as job on job.jobid = details.jobid
where job.jobname = 'purge-auth-audit'
order by details.runid desc
limit 3;
