create table if not exists public.trajectory_snapshots (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.trajectory_snapshots enable row level security;

drop policy if exists "Users can read their trajectory snapshot" on public.trajectory_snapshots;
create policy "Users can read their trajectory snapshot"
on public.trajectory_snapshots
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert their trajectory snapshot" on public.trajectory_snapshots;
create policy "Users can insert their trajectory snapshot"
on public.trajectory_snapshots
for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their trajectory snapshot" on public.trajectory_snapshots;
create policy "Users can update their trajectory snapshot"
on public.trajectory_snapshots
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their trajectory snapshot" on public.trajectory_snapshots;
create policy "Users can delete their trajectory snapshot"
on public.trajectory_snapshots
for delete
to authenticated
using ((select auth.uid()) = user_id);
