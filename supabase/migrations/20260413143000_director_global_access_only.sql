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
        and p.role = 'director'
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
  );
