create schema if not exists bi;

-- Date dimension generated from activity bounds.
create or replace view bi.dim_date as
with source_dates as (
  select (created_at at time zone 'utc')::date as d from public.monitoring_instances
  union all
  select (updated_at at time zone 'utc')::date as d from public.monitoring_instances
  union all
  select (created_at at time zone 'utc')::date as d from public.monitoring_reports
  union all
  select (created_at at time zone 'utc')::date as d from public.monitoring_events
  union all
  select (start_at at time zone 'utc')::date as d from public.monitoring_events
  union all
  select (end_at at time zone 'utc')::date as d from public.monitoring_events
),
bounds as (
  select
    coalesce(min(d), current_date - 365) as min_date,
    coalesce(max(d), current_date + 365) as max_date
  from source_dates
)
select
  gs::date as date_key,
  extract(year from gs)::int as year_number,
  extract(quarter from gs)::int as quarter_number,
  extract(month from gs)::int as month_number,
  to_char(gs, 'YYYY-MM') as month_label,
  extract(week from gs)::int as iso_week_number,
  extract(isodow from gs)::int as iso_weekday_number,
  to_char(gs, 'Dy') as weekday_short,
  case when extract(isodow from gs) in (6, 7) then true else false end as is_weekend
from bounds b
cross join lateral generate_series(b.min_date, b.max_date, interval '1 day') gs;

-- User dimension.
create or replace view bi.dim_user as
select
  p.id as user_id,
  coalesce(nullif(trim(p.full_name), ''), trim(concat_ws(' ', p.first_name, p.last_name)), p.email, p.doc_number) as full_name,
  p.first_name,
  p.last_name,
  p.email,
  p.doc_type,
  p.doc_number,
  case
    when p.role = 'admin' then 'Administrador'
    when p.role = 'especialista' then 'Especialista'
    else 'Usuario'
  end as role_label,
  p.role as role_code,
  case when p.status = 'active' then 'Activo' else 'Desactivado' end as status_label,
  p.status as status_code,
  p.created_at,
  p.updated_at
from public.profiles p;

-- Institution dimension.
create or replace view bi.dim_institution as
with ie_norm as (
  select
    ie.*,
    regexp_replace(coalesce(ie.cod_local, ''), '\D', '', 'g') as cod_local_digits,
    regexp_replace(coalesce(ie.cod_modular, ''), '\D', '', 'g') as cod_modular_digits
  from public.educational_institutions ie
),
ie_fixed as (
  select
    id,
    nombre_ie,
    case
      when length(cod_local_digits) = 6 then cod_local_digits
      when length(cod_modular_digits) = 6 then cod_modular_digits
      else nullif(cod_local_digits, '')
    end as cod_local_norm,
    case
      when length(cod_modular_digits) = 7 then cod_modular_digits
      when length(cod_local_digits) = 7 then cod_local_digits
      else nullif(cod_modular_digits, '')
    end as cod_modular_norm,
    nivel,
    modalidad,
    distrito,
    rei,
    nombre_director,
    estado,
    created_at,
    updated_at
  from ie_norm
),
ie_dedup as (
  select
    f.*,
    row_number() over (
      partition by upper(coalesce(f.nombre_ie, '')), upper(coalesce(f.distrito, '')), coalesce(f.cod_local_norm, ''), coalesce(f.cod_modular_norm, '')
      order by f.updated_at desc nulls last, f.created_at desc nulls last, f.id desc
    ) as rn
  from ie_fixed f
)
select
  d.id as institution_id,
  d.nombre_ie as institution_name,
  d.cod_local_norm as cod_local,
  d.cod_modular_norm as cod_modular,
  d.nivel as level_code,
  upper(d.nivel) as level_label,
  d.modalidad as modality_code,
  upper(d.modalidad) as modality_label,
  d.distrito as district_name,
  d.rei as rei_name,
  d.nombre_director as principal_name,
  d.estado as status_code,
  case when d.estado = 'active' then 'Activa' else 'Inactiva' end as status_label,
  d.created_at,
  d.updated_at
from ie_dedup d
where d.rn = 1;

-- Monitoring template dimension.
create or replace view bi.dim_template as
select
  t.id as template_id,
  t.title as template_title,
  t.description as template_description,
  t.status as template_status_code,
  case
    when t.status = 'published' then 'Publicado'
    when t.status = 'draft' then 'Borrador'
    else initcap(coalesce(t.status, 'sin_estado'))
  end as template_status_label,
  nullif(t.availability ->> 'status', '') as availability_status_code,
  nullif(t.availability ->> 'startAt', '')::timestamptz as availability_start_at,
  nullif(t.availability ->> 'endAt', '')::timestamptz as availability_end_at,
  t.created_by as created_by_identifier,
  t.created_at,
  t.updated_at
from public.monitoring_templates t;

-- Monitoring event dimension.
create or replace view bi.dim_event as
select
  e.id as event_id,
  e.title as event_title,
  e.event_type as event_type_code,
  case when e.event_type = 'monitoring' then 'Monitoreo' else 'Actividad' end as event_type_label,
  e.description as event_description,
  e.status as event_status_code,
  case
    when e.status = 'active' then 'Activo'
    when e.status = 'closed' then 'Cerrado'
    else 'Oculto'
  end as event_status_label,
  e.start_at,
  e.end_at,
  greatest(0, floor(extract(epoch from (e.end_at - e.start_at)) / 60))::int as duration_minutes,
  e.created_by,
  e.created_at,
  e.updated_at
from public.monitoring_events e;

-- Monitoring instances fact table (core process fact).
create or replace view bi.fact_monitoring_instance as
with report_agg as (
  select
    r.instance_id,
    count(*)::int as report_count,
    min(r.created_at) as first_report_at,
    max(r.created_at) as last_report_at
  from public.monitoring_reports r
  group by r.instance_id
),
instance_base as (
  select
    mi.id as instance_id,
    mi.template_id,
    mi.created_by as created_by_identifier,
    mi.status as instance_status_code,
    mi.created_at,
    mi.updated_at,
    coalesce(mi.data -> 'questions', '{}'::jsonb) as questions_json,
    regexp_replace(
      coalesce(
      nullif(mi.data #>> '{header,codLocal}', ''),
      nullif(mi.data #>> '{header,cod_local}', '')
      ),
      '\D',
      '',
      'g'
    ) as cod_local_instance_raw,
    regexp_replace(
      coalesce(
      nullif(mi.data #>> '{header,codModular}', ''),
      nullif(mi.data #>> '{header,cod_modular}', '')
      ),
      '\D',
      '',
      'g'
    ) as cod_modular_instance_raw
  from public.monitoring_instances mi
),
instance_codes as (
  select
    b.*,
    case
      when length(b.cod_local_instance_raw) = 6 then b.cod_local_instance_raw
      when length(b.cod_modular_instance_raw) = 6 then b.cod_modular_instance_raw
      else nullif(b.cod_local_instance_raw, '')
    end as cod_local_instance,
    case
      when length(b.cod_modular_instance_raw) = 7 then b.cod_modular_instance_raw
      when length(b.cod_local_instance_raw) = 7 then b.cod_local_instance_raw
      else nullif(b.cod_modular_instance_raw, '')
    end as cod_modular_instance
  from instance_base b
),
question_stats as (
  select
    b.instance_id,
    count(*)::int as question_total,
    count(*) filter (
      where nullif(trim(coalesce(q.value ->> 'answer', '')), '') is not null
    )::int as question_answered_count,
    count(*) filter (
      where upper(coalesce(q.value ->> 'answer', '')) = 'SI'
    )::int as answer_yes_count,
    count(*) filter (
      where upper(coalesce(q.value ->> 'answer', '')) = 'NO'
    )::int as answer_no_count,
    avg(
      case
        when nullif(trim(coalesce(q.value ->> 'level', '')), '') is null then null
        when (q.value ->> 'level') ~ '^-?[0-9]+(\.[0-9]+)?$' then (q.value ->> 'level')::numeric
        else null
      end
    )::numeric(12,2) as avg_level_numeric
  from instance_codes b
  left join lateral jsonb_each(b.questions_json) q(key, value) on true
  group by b.instance_id
)
select
  b.instance_id,
  b.template_id,
  t.template_title,
  du.user_id,
  coalesce(du.full_name, b.created_by_identifier) as created_by_name,
  b.created_by_identifier,
  ie.institution_id,
  ie.institution_name,
  coalesce(ie.cod_local, b.cod_local_instance) as cod_local,
  coalesce(ie.cod_modular, b.cod_modular_instance) as cod_modular,
  ie.district_name,
  ie.rei_name,
  ie.level_label as institution_level,
  ie.modality_label as institution_modality,
  b.instance_status_code,
  case
    when b.instance_status_code = 'completed' then 'Completado'
    when b.instance_status_code in ('in_progress', 'draft') then 'En proceso'
    else initcap(coalesce(b.instance_status_code, 'sin_estado'))
  end as instance_status_label,
  b.created_at,
  b.updated_at,
  (b.created_at at time zone 'utc')::date as created_date_key,
  (b.updated_at at time zone 'utc')::date as updated_date_key,
  qs.question_total,
  qs.question_answered_count,
  coalesce(qs.question_total, 0) - coalesce(qs.question_answered_count, 0) as question_pending_count,
  case
    when coalesce(qs.question_total, 0) = 0 then 0
    else round((coalesce(qs.question_answered_count, 0)::numeric / qs.question_total::numeric) * 100, 2)
  end as completion_pct,
  qs.answer_yes_count,
  qs.answer_no_count,
  qs.avg_level_numeric,
  coalesce(ra.report_count, 0) as report_count,
  ra.first_report_at,
  ra.last_report_at
from instance_codes b
left join bi.dim_template t
  on t.template_id = b.template_id
left join bi.dim_user du
  on lower(trim(coalesce(du.email, du.doc_number, du.user_id::text))) = lower(trim(coalesce(b.created_by_identifier, '')))
left join bi.dim_institution ie
  on (
    coalesce(nullif(trim(ie.cod_local), ''), '__none__') = coalesce(nullif(trim(b.cod_local_instance), ''), '__none__')
    or
    coalesce(nullif(trim(ie.cod_modular), ''), '__none__') = coalesce(nullif(trim(b.cod_modular_instance), ''), '__none__')
  )
left join question_stats qs
  on qs.instance_id = b.instance_id
left join report_agg ra
  on ra.instance_id = b.instance_id;

-- Monitoring reports fact table.
create or replace view bi.fact_monitoring_report as
select
  r.id as report_id,
  r.instance_id,
  f.template_id,
  f.template_title,
  f.user_id,
  f.created_by_name,
  f.institution_id,
  f.institution_name,
  f.cod_local,
  f.cod_modular,
  f.instance_status_code,
  r.created_by as report_created_by_identifier,
  r.report_url,
  r.created_at as report_created_at,
  (r.created_at at time zone 'utc')::date as report_date_key
from public.monitoring_reports r
left join bi.fact_monitoring_instance f
  on f.instance_id = r.instance_id;

-- Event assignment fact table (bridge for responsible users).
create or replace view bi.fact_event_assignment as
select
  r.id as event_assignment_id,
  r.event_id,
  e.event_title,
  e.event_type_code,
  e.event_type_label,
  e.event_status_code,
  e.event_status_label,
  e.start_at,
  e.end_at,
  (e.start_at at time zone 'utc')::date as event_start_date_key,
  (e.end_at at time zone 'utc')::date as event_end_date_key,
  r.user_id,
  du.full_name as responsible_name,
  du.email as responsible_email,
  r.level as level_code,
  upper(r.level) as level_label,
  r.modality as modality_code,
  upper(r.modality) as modality_label,
  r.course
from public.monitoring_event_responsibles r
join bi.dim_event e
  on e.event_id = r.event_id
left join bi.dim_user du
  on du.user_id = r.user_id;

-- Optional convenience view for Power BI model discovery.
create or replace view bi.vw_powerbi_model_health as
select 'fact_monitoring_instance' as object_name, count(*)::bigint as row_count from bi.fact_monitoring_instance
union all
select 'fact_monitoring_report', count(*)::bigint from bi.fact_monitoring_report
union all
select 'fact_event_assignment', count(*)::bigint from bi.fact_event_assignment
union all
select 'dim_institution', count(*)::bigint from bi.dim_institution
union all
select 'dim_template', count(*)::bigint from bi.dim_template
union all
select 'dim_user', count(*)::bigint from bi.dim_user
union all
select 'dim_event', count(*)::bigint from bi.dim_event
union all
select 'dim_date', count(*)::bigint from bi.dim_date;

-- Grants for a dedicated read-only BI user, if it exists.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'pbi_reader') then
    grant usage on schema bi to pbi_reader;
    grant select on all tables in schema bi to pbi_reader;
    alter default privileges in schema bi grant select on tables to pbi_reader;
  end if;
end $$;
