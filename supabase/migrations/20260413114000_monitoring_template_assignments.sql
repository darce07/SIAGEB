alter table public.monitoring_requests
  add column if not exists assigned_monitor_ids jsonb not null default '[]'::jsonb,
  add column if not exists cdd_area text;

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check
  check (role in ('admin', 'user', 'especialista', 'director', 'jefe_area'));

drop policy if exists profiles_management_read on public.profiles;
create policy profiles_management_read
  on public.profiles
  for select
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.status = 'active'
        and p.role in ('admin', 'director', 'jefe_area')
    )
  );

create table if not exists public.monitoring_template_monitors (
  id uuid primary key default uuid_generate_v4(),
  template_id uuid not null references public.monitoring_templates(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (template_id, user_id)
);

create index if not exists monitoring_template_monitors_template_idx
  on public.monitoring_template_monitors (template_id);

create index if not exists monitoring_template_monitors_user_idx
  on public.monitoring_template_monitors (user_id);

alter table public.monitoring_template_monitors enable row level security;

drop policy if exists monitoring_template_monitors_select_policy on public.monitoring_template_monitors;
create policy monitoring_template_monitors_select_policy
  on public.monitoring_template_monitors
  for select
  using (
    public.is_admin_user()
    or user_id = auth.uid()
  );

drop policy if exists monitoring_template_monitors_admin_write_policy on public.monitoring_template_monitors;
create policy monitoring_template_monitors_admin_write_policy
  on public.monitoring_template_monitors
  for all
  using (public.is_admin_user())
  with check (public.is_admin_user());

create or replace function public.can_view_monitoring_template(p_template_id uuid)
returns boolean
language sql
stable
as $$
  select (
    public.is_admin_user()
    or exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.status = 'active'
        and p.role in ('director', 'jefe_area')
    )
    or exists (
      select 1
      from public.monitoring_templates t
      join public.monitoring_template_monitors m
        on m.template_id = t.id
      where t.id = p_template_id
        and t.status = 'published'
        and m.user_id = auth.uid()
    )
  )
$$;

drop policy if exists monitoring_templates_select_policy on public.monitoring_templates;
create policy monitoring_templates_select_policy
  on public.monitoring_templates
  for select
  using (
    public.is_admin_user()
    or (
      status = 'published'
      and exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.status = 'active'
          and p.role in ('director', 'jefe_area')
      )
    )
    or (
      status = 'published'
      and exists (
        select 1
        from public.monitoring_template_monitors m
        where m.template_id = monitoring_templates.id
          and m.user_id = auth.uid()
      )
    )
  );

drop policy if exists monitoring_instances_select_policy on public.monitoring_instances;
create policy monitoring_instances_select_policy
  on public.monitoring_instances
  for select
  using (
    public.is_admin_user()
    or (
      created_by = public.current_user_identifier()
      and public.can_view_monitoring_template(template_id)
    )
  );

drop policy if exists monitoring_instances_insert_policy on public.monitoring_instances;
create policy monitoring_instances_insert_policy
  on public.monitoring_instances
  for insert
  with check (
    public.is_admin_user()
    or (
      created_by = public.current_user_identifier()
      and public.can_view_monitoring_template(template_id)
    )
  );

drop policy if exists monitoring_instances_update_policy on public.monitoring_instances;
create policy monitoring_instances_update_policy
  on public.monitoring_instances
  for update
  using (
    public.is_admin_user()
    or (
      created_by = public.current_user_identifier()
      and public.can_view_monitoring_template(template_id)
    )
  )
  with check (
    public.is_admin_user()
    or (
      created_by = public.current_user_identifier()
      and public.can_view_monitoring_template(template_id)
    )
  );

drop policy if exists monitoring_instances_delete_policy on public.monitoring_instances;
create policy monitoring_instances_delete_policy
  on public.monitoring_instances
  for delete
  using (
    public.is_admin_user()
    or (
      created_by = public.current_user_identifier()
      and public.can_view_monitoring_template(template_id)
    )
  );

drop policy if exists monitoring_reports_select_policy on public.monitoring_reports;
create policy monitoring_reports_select_policy
  on public.monitoring_reports
  for select
  using (
    public.is_admin_user()
    or (
      created_by = public.current_user_identifier()
      and exists (
        select 1
        from public.monitoring_instances mi
        where mi.id = monitoring_reports.instance_id
          and public.can_view_monitoring_template(mi.template_id)
      )
    )
  );

drop policy if exists monitoring_reports_insert_policy on public.monitoring_reports;
create policy monitoring_reports_insert_policy
  on public.monitoring_reports
  for insert
  with check (
    public.is_admin_user()
    or (
      created_by = public.current_user_identifier()
      and exists (
        select 1
        from public.monitoring_instances mi
        where mi.id = monitoring_reports.instance_id
          and public.can_view_monitoring_template(mi.template_id)
      )
    )
  );

drop policy if exists monitoring_reports_delete_policy on public.monitoring_reports;
create policy monitoring_reports_delete_policy
  on public.monitoring_reports
  for delete
  using (
    public.is_admin_user()
    or (
      created_by = public.current_user_identifier()
      and exists (
        select 1
        from public.monitoring_instances mi
        where mi.id = monitoring_reports.instance_id
          and public.can_view_monitoring_template(mi.template_id)
      )
    )
  );
