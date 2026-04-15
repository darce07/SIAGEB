-- Seguimiento visibility model:
-- - Global read for authenticated active roles (admin/user/especialista/director/jefe_area).
-- - Write operations only for admin.

alter table if exists public.monitoring_events enable row level security;
alter table if exists public.monitoring_event_objectives enable row level security;
alter table if exists public.monitoring_event_responsibles enable row level security;

drop policy if exists monitoring_events_select_policy on public.monitoring_events;
create policy monitoring_events_select_policy
  on public.monitoring_events
  for select
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.status = 'active'
        and p.role in ('admin', 'user', 'especialista', 'director', 'jefe_area')
    )
  );

drop policy if exists monitoring_events_admin_write_policy on public.monitoring_events;
create policy monitoring_events_admin_write_policy
  on public.monitoring_events
  for all
  using (public.is_admin_user())
  with check (public.is_admin_user());

drop policy if exists monitoring_event_objectives_select_policy on public.monitoring_event_objectives;
create policy monitoring_event_objectives_select_policy
  on public.monitoring_event_objectives
  for select
  using (
    exists (
      select 1
      from public.monitoring_events e
      where e.id = monitoring_event_objectives.event_id
    )
    and exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.status = 'active'
        and p.role in ('admin', 'user', 'especialista', 'director', 'jefe_area')
    )
  );

drop policy if exists monitoring_event_objectives_admin_write_policy on public.monitoring_event_objectives;
create policy monitoring_event_objectives_admin_write_policy
  on public.monitoring_event_objectives
  for all
  using (public.is_admin_user())
  with check (public.is_admin_user());

drop policy if exists monitoring_event_responsibles_select_policy on public.monitoring_event_responsibles;
create policy monitoring_event_responsibles_select_policy
  on public.monitoring_event_responsibles
  for select
  using (
    exists (
      select 1
      from public.monitoring_events e
      where e.id = monitoring_event_responsibles.event_id
    )
    and exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.status = 'active'
        and p.role in ('admin', 'user', 'especialista', 'director', 'jefe_area')
    )
  );

drop policy if exists monitoring_event_responsibles_admin_write_policy on public.monitoring_event_responsibles;
create policy monitoring_event_responsibles_admin_write_policy
  on public.monitoring_event_responsibles
  for all
  using (public.is_admin_user())
  with check (public.is_admin_user());
