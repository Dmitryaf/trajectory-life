-- Apply only after explicit operator approval and the matching migration.
-- Re-running updates the one existing named job instead of creating duplicates.
select cron.schedule(
  'purge-auth-audit',
  '35 * * * *',
  $$select private.purge_auth_audit();$$
);
