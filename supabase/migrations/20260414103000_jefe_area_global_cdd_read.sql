create or replace function public.is_cdd_published_template(p_template_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.monitoring_templates t
    where t.id = p_template_id
      and t.status = 'published'
      and lower(coalesce(t.levels_config->'scope'->>'cdd', '')) = 'si'
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
          and p.role = 'director'
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
    or (
      exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.status = 'active'
          and p.role = 'jefe_area'
      )
      and lower(coalesce(monitoring_templates.levels_config->'scope'->>'cdd', '')) = 'si'
      and status = 'published'
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
    or (
      exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.status = 'active'
          and p.role = 'jefe_area'
      )
      and public.is_cdd_published_template(template_id)
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
    or (
      exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.status = 'active'
          and p.role = 'jefe_area'
      )
      and exists (
        select 1
        from public.monitoring_instances mi
        where mi.id = monitoring_reports.instance_id
          and public.is_cdd_published_template(mi.template_id)
      )
    )
  );
