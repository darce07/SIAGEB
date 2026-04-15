-- Safe global source for dashboard only (Inicio).
-- Keeps RLS restrictions for Monitoreos/Reportes while allowing
-- admin/director/jefe_area to read global CDD metrics source.

create or replace function public.get_cdd_dashboard_source()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_allowed boolean;
begin
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.status = 'active'
      and p.role in ('admin', 'director', 'jefe_area')
  )
  into v_allowed;

  if not v_allowed then
    return jsonb_build_object(
      'templates', '[]'::jsonb,
      'instances', '[]'::jsonb,
      'template_monitors', '[]'::jsonb,
      'profiles', '[]'::jsonb
    );
  end if;

  return jsonb_build_object(
    'templates',
      coalesce((
        select jsonb_agg(to_jsonb(t))
        from (
          select
            mt.id,
            mt.title,
            mt.status,
            mt.availability,
            mt.levels_config,
            mt.sections,
            mt.created_by,
            mt.created_at,
            mt.updated_at
          from public.monitoring_templates mt
          order by mt.updated_at desc nulls last
        ) t
      ), '[]'::jsonb),
    'instances',
      coalesce((
        select jsonb_agg(to_jsonb(mi))
        from (
          select
            m.id,
            m.template_id,
            m.status,
            m.created_by,
            m.created_at,
            m.updated_at,
            m.data
          from public.monitoring_instances m
          order by m.updated_at desc nulls last
        ) mi
      ), '[]'::jsonb),
    'template_monitors',
      coalesce((
        select jsonb_agg(to_jsonb(mm))
        from (
          select
            m.template_id,
            m.user_id,
            m.created_at
          from public.monitoring_template_monitors m
        ) mm
      ), '[]'::jsonb),
    'profiles',
      coalesce((
        select jsonb_agg(to_jsonb(pf))
        from (
          select
            p.id,
            p.full_name,
            p.first_name,
            p.last_name,
            p.email,
            p.doc_number,
            p.role,
            p.status
          from public.profiles p
          where p.status = 'active'
        ) pf
      ), '[]'::jsonb)
  );
end;
$$;

grant execute on function public.get_cdd_dashboard_source() to authenticated;
