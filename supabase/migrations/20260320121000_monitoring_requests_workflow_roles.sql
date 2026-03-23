alter table public.monitoring_requests
  add column if not exists created_by_id uuid default auth.uid(),
  add column if not exists workflow_meta jsonb not null default '{}'::jsonb;

drop policy if exists monitoring_requests_admin_select_policy on public.monitoring_requests;
drop policy if exists monitoring_requests_admin_write_policy on public.monitoring_requests;
drop policy if exists monitoring_requests_select_policy on public.monitoring_requests;
drop policy if exists monitoring_requests_insert_policy on public.monitoring_requests;
drop policy if exists monitoring_requests_update_policy on public.monitoring_requests;
drop policy if exists monitoring_requests_delete_policy on public.monitoring_requests;

create policy monitoring_requests_select_policy
  on public.monitoring_requests
  for select
  using (
    public.is_admin_user()
    or created_by_id = auth.uid()
  );

create policy monitoring_requests_insert_policy
  on public.monitoring_requests
  for insert
  with check (
    public.is_admin_user()
    or created_by_id = auth.uid()
  );

create policy monitoring_requests_update_policy
  on public.monitoring_requests
  for update
  using (
    public.is_admin_user()
    or created_by_id = auth.uid()
  )
  with check (
    public.is_admin_user()
    or created_by_id = auth.uid()
  );

create policy monitoring_requests_delete_policy
  on public.monitoring_requests
  for delete
  using (public.is_admin_user());
