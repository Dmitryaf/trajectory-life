-- Operator installation, after migration. Supabase Cron (pg_cron) must be enabled first.
-- Run against the intended environment only. Check job_run_details and oldest retained event before enabling collection.
select cron.schedule('purge-product-events', '15 * * * *', $$select public.purge_product_events();$$);
select jobid, jobname, schedule, active from cron.job where jobname = 'purge-product-events';
