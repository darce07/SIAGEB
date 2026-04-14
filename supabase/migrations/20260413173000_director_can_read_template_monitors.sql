drop policy if exists monitoring_template_monitors_select_policy on public.monitoring_template_monitors;
create policy monitoring_template_monitors_select_policy
  on public.monitoring_template_monitors
  for select
  using (
    public.is_admin_user()
    or user_id = auth.uid()
    or exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.status = 'active'
        and p.role = 'director'
    )
  );
