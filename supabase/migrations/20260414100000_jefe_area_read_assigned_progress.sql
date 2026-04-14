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
    or (
      exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.status = 'active'
          and p.role in ('director', 'jefe_area')
      )
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
    or (
      exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.status = 'active'
          and p.role in ('director', 'jefe_area')
      )
      and exists (
        select 1
        from public.monitoring_instances mi
        where mi.id = monitoring_reports.instance_id
          and public.can_view_monitoring_template(mi.template_id)
      )
    )
  );
