alter table public.trajectory_snapshots
add column if not exists revision bigint not null default 1;

alter table public.trajectory_snapshots
drop constraint if exists trajectory_snapshots_revision_check;

alter table public.trajectory_snapshots
add constraint trajectory_snapshots_revision_check check (revision > 0);

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'trajectory_snapshots'
  ) then
    alter publication supabase_realtime add table public.trajectory_snapshots;
  end if;
end $$;
