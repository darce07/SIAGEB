-- Power BI read-only model for CDD monitoring progress.
-- Security model:
-- - pbi_reader is a NOLOGIN group role used only for read-only grants.
-- - A real LOGIN role can be created by the DBA and granted pbi_reader.
-- - Direct access to public base tables is explicitly revoked.
-- - Power BI should only read views in schema bi.

create schema if not exists bi;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'pbi_reader') then
    create role pbi_reader nologin;
  end if;
end
$$;

revoke all on schema public from pbi_reader;
revoke all on all tables in schema public from pbi_reader;
revoke all on all sequences in schema public from pbi_reader;
revoke all on all functions in schema public from pbi_reader;
revoke all on schema bi from pbi_reader;
revoke all on all tables in schema bi from pbi_reader;

-- Safe numeric parser for values like "31", "31.5", "31,5" or "31 %".
create or replace function bi.safe_numeric(p_value text)
returns numeric
language sql
immutable
as $$
  select case
    when p_value is null then null
    when replace(regexp_replace(trim(p_value), '[^0-9,.-]', '', 'g'), ',', '.') ~ '^-?[0-9]+(\.[0-9]+)?$'
      then replace(regexp_replace(trim(p_value), '[^0-9,.-]', '', 'g'), ',', '.')::numeric
    else null
  end
$$;

create or replace view bi.dim_cdd_date as
with source_dates as (
  select (mt.created_at at time zone 'utc')::date as d
  from public.monitoring_templates mt
  where lower(coalesce(mt.levels_config->'scope'->>'cdd', '')) = 'si'
  union all
  select (mt.updated_at at time zone 'utc')::date
  from public.monitoring_templates mt
  where lower(coalesce(mt.levels_config->'scope'->>'cdd', '')) = 'si'
  union all
  select (nullif(mt.availability->>'startAt', '')::timestamptz at time zone 'utc')::date
  from public.monitoring_templates mt
  where lower(coalesce(mt.levels_config->'scope'->>'cdd', '')) = 'si'
    and nullif(mt.availability->>'startAt', '') is not null
  union all
  select (nullif(mt.availability->>'endAt', '')::timestamptz at time zone 'utc')::date
  from public.monitoring_templates mt
  where lower(coalesce(mt.levels_config->'scope'->>'cdd', '')) = 'si'
    and nullif(mt.availability->>'endAt', '') is not null
  union all
  select (mi.updated_at at time zone 'utc')::date
  from public.monitoring_instances mi
  join public.monitoring_templates mt on mt.id = mi.template_id
  where lower(coalesce(mt.levels_config->'scope'->>'cdd', '')) = 'si'
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
  extract(month from gs)::int as month_number,
  extract(day from gs)::int as day_number,
  extract(quarter from gs)::int as quarter_number,
  extract(isodow from gs)::int as iso_weekday_number,
  to_char(gs, 'YYYY-MM') as month_label,
  to_char(gs, 'TMDay') as weekday_label,
  case when extract(isodow from gs) in (6, 7) then true else false end as is_weekend
from bounds b
cross join lateral generate_series(b.min_date, b.max_date, interval '1 day') gs;

create or replace view bi.dim_cdd_monitoring as
select
  mt.id as monitoring_id,
  mt.title as monitoring_title,
  mt.status as template_status_code,
  case
    when mt.status = 'published' then 'Publicado'
    when mt.status = 'draft' then 'Borrador'
    else initcap(coalesce(mt.status, 'sin_estado'))
  end as template_status_label,
  coalesce(nullif(mt.levels_config->'scope'->>'cddArea', ''), 'Sin area') as cdd_area,
  nullif(mt.availability->>'status', '') as availability_status_code,
  case
    when nullif(mt.availability->>'status', '') = 'active' then 'Activo'
    when nullif(mt.availability->>'status', '') = 'scheduled' then 'Programado'
    when nullif(mt.availability->>'status', '') = 'closed' then 'Cerrado'
    when nullif(mt.availability->>'startAt', '')::timestamptz > now() then 'Programado'
    when nullif(mt.availability->>'endAt', '')::timestamptz < now() then 'Cerrado'
    else 'Activo'
  end as monitoring_state_label,
  nullif(mt.availability->>'startAt', '')::timestamptz as start_at,
  nullif(mt.availability->>'endAt', '')::timestamptz as end_at,
  (nullif(mt.availability->>'startAt', '')::timestamptz at time zone 'utc')::date as start_date_key,
  (nullif(mt.availability->>'endAt', '')::timestamptz at time zone 'utc')::date as end_date_key,
  mt.created_at,
  mt.updated_at
from public.monitoring_templates mt
where mt.status = 'published'
  and lower(coalesce(mt.levels_config->'scope'->>'cdd', '')) = 'si';

create or replace view bi.dim_cdd_responsible as
select
  p.id as user_id,
  coalesce(nullif(trim(p.full_name), ''), trim(concat_ws(' ', p.first_name, p.last_name)), 'Sin nombre') as responsible_name,
  case
    when p.role = 'jefe_area' then 'Jefe de Area'
    when p.role = 'director' then 'Director'
    when p.role = 'admin' then 'Administrador'
    when p.role in ('user', 'especialista') then 'Especialista'
    else 'Usuario'
  end as role_label,
  p.role as role_code,
  case when p.status = 'active' then 'Activo' else 'Inactivo' end as status_label
from public.profiles p;

create or replace view bi.fact_cdd_monitoring_progress as
with latest_instance as (
  select distinct on (mi.template_id)
    mi.id as instance_id,
    mi.template_id,
    mi.status as instance_status_code,
    mi.created_by as submitted_by_identifier,
    mi.created_at as instance_created_at,
    mi.updated_at as instance_updated_at,
    mi.data
  from public.monitoring_instances mi
  join public.monitoring_templates mt on mt.id = mi.template_id
  where mt.status = 'published'
    and lower(coalesce(mt.levels_config->'scope'->>'cdd', '')) = 'si'
  order by mi.template_id, mi.updated_at desc nulls last, mi.created_at desc nulls last, mi.id desc
),
template_questions as (
  select
    mt.id as template_id,
    question.value->>'id' as question_id,
    translate(
      lower(
        coalesce(
          question.value->>'label',
          question.value->>'title',
          question.value->>'question',
          question.value->>'prompt',
          question.value->>'text',
          question.value->>'name',
          ''
        )
      ),
      U&'\00e1\00e9\00ed\00f3\00fa\00fc\00f1',
      'aeiouun'
    ) as question_label,
    lower(coalesce(question.value->>'sourceType', question.value->>'type', '')) as question_type
  from public.monitoring_templates mt
  cross join lateral jsonb_array_elements(coalesce(mt.sections, '[]'::jsonb)) section(value)
  cross join lateral jsonb_array_elements(coalesce(section.value->'questions', '[]'::jsonb)) question(value)
  where mt.status = 'published'
    and lower(coalesce(mt.levels_config->'scope'->>'cdd', '')) = 'si'
),
answer_rows as (
  select
    li.instance_id,
    li.template_id,
    answers.key as question_id,
    tq.question_label,
    tq.question_type,
    coalesce(
      bi.safe_numeric(answers.value->>'answer'),
      bi.safe_numeric(answers.value->>'value'),
      bi.safe_numeric(answers.value->>'numeric'),
      bi.safe_numeric(answers.value->>'number'),
      bi.safe_numeric(answers.value->>'result'),
      bi.safe_numeric(answers.value->>'respuesta'),
      bi.safe_numeric(answers.value #>> '{}')
    ) as numeric_value
  from latest_instance li
  cross join lateral jsonb_each(coalesce(li.data->'questions', '{}'::jsonb)) answers(key, value)
  left join template_questions tq
    on tq.template_id = li.template_id
   and tq.question_id = answers.key
),
ranked_numeric as (
  select
    ar.*,
    row_number() over (partition by ar.template_id order by ar.question_id) as numeric_position
  from answer_rows ar
  where ar.numeric_value is not null
    and (
      ar.question_type in ('number', 'numeric', 'numero', 'number_input')
      or ar.question_label like '%meta%'
      or ar.question_label like '%avance%'
      or ar.question_label like '%progreso%'
      or ar.question_label like '%real%'
      or ar.question_type is null
    )
),
progress_values as (
  select
    li.template_id,
    li.instance_id as latest_instance_id,
    li.instance_status_code,
    li.submitted_by_identifier,
    li.instance_created_at,
    li.instance_updated_at,
    coalesce(
      max(rn.numeric_value) filter (where rn.question_label like '%meta%'),
      max(rn.numeric_value) filter (where rn.numeric_position = 1),
      0
    ) as goal_value,
    coalesce(
      max(rn.numeric_value) filter (where rn.question_label like '%avance%' or rn.question_label like '%progreso%' or rn.question_label like '%real%'),
      max(rn.numeric_value) filter (where rn.numeric_position = 2),
      max(rn.numeric_value) filter (where rn.numeric_position = 1),
      0
    ) as real_value
  from latest_instance li
  left join ranked_numeric rn on rn.template_id = li.template_id
  group by
    li.template_id,
    li.instance_id,
    li.instance_status_code,
    li.submitted_by_identifier,
    li.instance_created_at,
    li.instance_updated_at
),
responsible_agg as (
  select
    mtm.template_id,
    (array_agg(mtm.user_id order by coalesce(p.full_name, trim(concat_ws(' ', p.first_name, p.last_name)), 'Sin nombre'), mtm.user_id::text))[1] as primary_responsible_id,
    string_agg(coalesce(p.full_name, trim(concat_ws(' ', p.first_name, p.last_name)), 'Sin nombre'), ', ' order by p.full_name) as responsible_names
  from public.monitoring_template_monitors mtm
  left join public.profiles p on p.id = mtm.user_id
  group by mtm.template_id
)
select
  dm.monitoring_id,
  pv.latest_instance_id,
  dm.monitoring_title,
  dm.cdd_area,
  dm.monitoring_state_label,
  dm.start_at,
  dm.end_at,
  dm.start_date_key,
  dm.end_date_key,
  ra.primary_responsible_id,
  coalesce(ra.responsible_names, 'Sin responsable') as responsible_names,
  coalesce(pv.goal_value, 0)::numeric(14,2) as meta,
  coalesce(pv.real_value, 0)::numeric(14,2) as avance_real,
  case
    when coalesce(pv.goal_value, 0) <= 0 then 0
    else round(least(100, greatest(0, (coalesce(pv.real_value, 0) / pv.goal_value) * 100)), 2)
  end as cumplimiento_pct,
  case
    when coalesce(pv.goal_value, 0) <= 0 then 0
    else round(greatest(0, pv.goal_value - coalesce(pv.real_value, 0)), 2)
  end as brecha_meta,
  pv.instance_status_code,
  pv.submitted_by_identifier,
  pv.instance_created_at,
  pv.instance_updated_at,
  coalesce(pv.instance_updated_at, dm.updated_at) as last_change_at,
  (coalesce(pv.instance_updated_at, dm.updated_at) at time zone 'utc')::date as last_change_date_key
from bi.dim_cdd_monitoring dm
left join progress_values pv on pv.template_id = dm.monitoring_id
left join responsible_agg ra on ra.template_id = dm.monitoring_id;

create or replace view bi.fact_cdd_area_summary as
select
  cdd_area,
  count(*)::int as monitoring_count,
  sum(meta)::numeric(14,2) as total_meta,
  sum(avance_real)::numeric(14,2) as total_avance_real,
  case
    when sum(meta) <= 0 then 0
    else round(least(100, greatest(0, (sum(avance_real) / sum(meta)) * 100)), 2)
  end as cumplimiento_pct,
  max(last_change_at) as last_change_at
from bi.fact_cdd_monitoring_progress
group by cdd_area;

create or replace view bi.fact_cdd_dashboard_summary as
select
  count(*)::int as monitoring_count,
  sum(meta)::numeric(14,2) as total_meta,
  sum(avance_real)::numeric(14,2) as total_avance_real,
  case
    when sum(meta) <= 0 then 0
    else round(least(100, greatest(0, (sum(avance_real) / sum(meta)) * 100)), 2)
  end as cumplimiento_global_pct,
  max(last_change_at) as last_change_at
from bi.fact_cdd_monitoring_progress;

create or replace view bi.vw_powerbi_cdd_health as
select 'fact_cdd_monitoring_progress' as object_name, count(*)::bigint as row_count from bi.fact_cdd_monitoring_progress
union all
select 'fact_cdd_area_summary', count(*)::bigint from bi.fact_cdd_area_summary
union all
select 'dim_cdd_monitoring', count(*)::bigint from bi.dim_cdd_monitoring
union all
select 'dim_cdd_responsible', count(*)::bigint from bi.dim_cdd_responsible
union all
select 'dim_cdd_date', count(*)::bigint from bi.dim_cdd_date;

grant usage on schema bi to pbi_reader;
grant execute on function bi.safe_numeric(text) to pbi_reader;
grant select on
  bi.dim_cdd_date,
  bi.dim_cdd_monitoring,
  bi.dim_cdd_responsible,
  bi.fact_cdd_monitoring_progress,
  bi.fact_cdd_area_summary,
  bi.fact_cdd_dashboard_summary,
  bi.vw_powerbi_cdd_health
  to pbi_reader;

-- Keep future BI objects closed by default. Grant explicitly per view.
alter default privileges in schema bi revoke all on tables from pbi_reader;

comment on role pbi_reader is 'Read-only group role for Power BI. Grant this role to a separate LOGIN user; do not use app users.';
comment on view bi.fact_cdd_monitoring_progress is 'Power BI fact view for CDD monitoring meta, avance real and cumplimiento percentage. Read-only for pbi_reader.';
