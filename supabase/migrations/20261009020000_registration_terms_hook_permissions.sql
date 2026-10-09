-- CREATE OR REPLACE preserves the existing Auth hook owner, which can differ from the migration role.
do $$
declare
  hook_owner name;
begin
  select pg_get_userbyid(proowner) into hook_owner
  from pg_proc where oid = 'public.hook_require_beta_invite(jsonb)'::regprocedure;
  execute format('grant execute on function private.valid_registration_terms(jsonb) to %I', hook_owner);
end;
$$;
