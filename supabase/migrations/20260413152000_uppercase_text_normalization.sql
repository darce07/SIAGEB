create or replace function public.to_upper_clean(value text)
returns text
language sql
immutable
as $$
  select case
    when value is null then null
    else upper(trim(regexp_replace(value, '\s+', ' ', 'g')))
  end
$$;

alter table if exists public.monitoring_requests
  add column if not exists cdd_area text;

create or replace function public.trg_profiles_uppercase_fields()
returns trigger
language plpgsql
as $$
begin
  new.first_name := public.to_upper_clean(new.first_name);
  new.last_name := public.to_upper_clean(new.last_name);
  new.full_name := public.to_upper_clean(new.full_name);
  new.doc_type := public.to_upper_clean(new.doc_type);
  new.doc_number := public.to_upper_clean(new.doc_number);
  return new;
end;
$$;

drop trigger if exists profiles_uppercase_fields on public.profiles;
create trigger profiles_uppercase_fields
before insert or update on public.profiles
for each row execute function public.trg_profiles_uppercase_fields();

create or replace function public.trg_monitoring_requests_uppercase_fields()
returns trigger
language plpgsql
as $$
begin
  new.code := public.to_upper_clean(new.code);
  new.name := public.to_upper_clean(new.name);
  new.detail := public.to_upper_clean(new.detail);
  new.cdd_area := public.to_upper_clean(new.cdd_area);
  return new;
end;
$$;

drop trigger if exists monitoring_requests_uppercase_fields on public.monitoring_requests;
create trigger monitoring_requests_uppercase_fields
before insert or update on public.monitoring_requests
for each row execute function public.trg_monitoring_requests_uppercase_fields();

create or replace function public.trg_monitoring_templates_uppercase_fields()
returns trigger
language plpgsql
as $$
begin
  new.title := public.to_upper_clean(new.title);
  new.description := public.to_upper_clean(new.description);
  return new;
end;
$$;

drop trigger if exists monitoring_templates_uppercase_fields on public.monitoring_templates;
create trigger monitoring_templates_uppercase_fields
before insert or update on public.monitoring_templates
for each row execute function public.trg_monitoring_templates_uppercase_fields();

create or replace function public.trg_monitoring_events_uppercase_fields()
returns trigger
language plpgsql
as $$
begin
  new.title := public.to_upper_clean(new.title);
  new.description := public.to_upper_clean(new.description);
  return new;
end;
$$;

drop trigger if exists monitoring_events_uppercase_fields on public.monitoring_events;
create trigger monitoring_events_uppercase_fields
before insert or update on public.monitoring_events
for each row execute function public.trg_monitoring_events_uppercase_fields();

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'monitoring_event_objectives'
      and column_name = 'objective_text'
  ) then
    execute $fn$
      create or replace function public.trg_monitoring_event_objectives_uppercase_fields()
      returns trigger
      language plpgsql
      as $$
      begin
        new.objective_text := public.to_upper_clean(new.objective_text);
        return new;
      end;
      $$;
    $fn$;
  elsif exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'monitoring_event_objectives'
      and column_name = 'text'
  ) then
    execute $fn$
      create or replace function public.trg_monitoring_event_objectives_uppercase_fields()
      returns trigger
      language plpgsql
      as $$
      begin
        new.text := public.to_upper_clean(new.text);
        return new;
      end;
      $$;
    $fn$;
  else
    execute $fn$
      create or replace function public.trg_monitoring_event_objectives_uppercase_fields()
      returns trigger
      language plpgsql
      as $$
      begin
        return new;
      end;
      $$;
    $fn$;
  end if;
end;
$$;

drop trigger if exists monitoring_event_objectives_uppercase_fields on public.monitoring_event_objectives;
create trigger monitoring_event_objectives_uppercase_fields
before insert or update on public.monitoring_event_objectives
for each row execute function public.trg_monitoring_event_objectives_uppercase_fields();

create or replace function public.trg_educational_institutions_uppercase_fields()
returns trigger
language plpgsql
as $$
begin
  new.nombre_ie := public.to_upper_clean(new.nombre_ie);
  new.cod_local := public.to_upper_clean(new.cod_local);
  new.cod_modular := public.to_upper_clean(new.cod_modular);
  new.nivel := public.to_upper_clean(new.nivel);
  new.modalidad := public.to_upper_clean(new.modalidad);
  new.distrito := public.to_upper_clean(new.distrito);
  new.rei := public.to_upper_clean(new.rei);
  new.nombre_director := public.to_upper_clean(new.nombre_director);
  return new;
end;
$$;

drop trigger if exists educational_institutions_uppercase_fields on public.educational_institutions;
create trigger educational_institutions_uppercase_fields
before insert or update on public.educational_institutions
for each row execute function public.trg_educational_institutions_uppercase_fields();

update public.profiles
set
  first_name = public.to_upper_clean(first_name),
  last_name = public.to_upper_clean(last_name),
  full_name = public.to_upper_clean(full_name),
  doc_type = public.to_upper_clean(doc_type),
  doc_number = public.to_upper_clean(doc_number);

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'monitoring_requests'
      and column_name = 'cdd_area'
  ) then
    execute $sql$
      update public.monitoring_requests
      set
        code = public.to_upper_clean(code),
        name = public.to_upper_clean(name),
        detail = public.to_upper_clean(detail),
        cdd_area = public.to_upper_clean(cdd_area)
    $sql$;
  else
    execute $sql$
      update public.monitoring_requests
      set
        code = public.to_upper_clean(code),
        name = public.to_upper_clean(name),
        detail = public.to_upper_clean(detail)
    $sql$;
  end if;
end;
$$;

update public.monitoring_templates
set
  title = public.to_upper_clean(title),
  description = public.to_upper_clean(description);

update public.monitoring_events
set
  title = public.to_upper_clean(title),
  description = public.to_upper_clean(description);

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'monitoring_event_objectives'
      and column_name = 'objective_text'
  ) then
    execute $sql$
      update public.monitoring_event_objectives
      set objective_text = public.to_upper_clean(objective_text)
    $sql$;
  elsif exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'monitoring_event_objectives'
      and column_name = 'text'
  ) then
    execute $sql$
      update public.monitoring_event_objectives
      set text = public.to_upper_clean(text)
    $sql$;
  end if;
end;
$$;

update public.educational_institutions
set
  nombre_ie = public.to_upper_clean(nombre_ie),
  cod_local = public.to_upper_clean(cod_local),
  cod_modular = public.to_upper_clean(cod_modular),
  nivel = public.to_upper_clean(nivel),
  modalidad = public.to_upper_clean(modalidad),
  distrito = public.to_upper_clean(distrito),
  rei = public.to_upper_clean(rei),
  nombre_director = public.to_upper_clean(nombre_director);
