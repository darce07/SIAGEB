create extension if not exists "uuid-ossp";

create table if not exists public.monitoring_templates (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  description text,
  status text not null default 'draft',
  levels_config jsonb not null,
  sections jsonb not null,
  availability jsonb not null,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.monitoring_instances (
  id uuid primary key default uuid_generate_v4(),
  template_id uuid not null references public.monitoring_templates(id) on delete cascade,
  created_by text,
  status text not null default 'in_progress',
  data jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.monitoring_reports (
  id uuid primary key default uuid_generate_v4(),
  instance_id uuid not null references public.monitoring_instances(id) on delete cascade,
  created_by text,
  report_url text,
  created_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_monitoring_templates_updated_at on public.monitoring_templates;
create trigger set_monitoring_templates_updated_at
before update on public.monitoring_templates
for each row execute function public.set_updated_at();

drop trigger if exists set_monitoring_instances_updated_at on public.monitoring_instances;
create trigger set_monitoring_instances_updated_at
before update on public.monitoring_instances
for each row execute function public.set_updated_at();

create or replace function public.current_user_identifier()
returns text
language sql
stable
as $$
  select coalesce(p.email, p.doc_number, '')
  from public.profiles p
  where p.id = auth.uid()
  limit 1
$$;

create or replace function public.is_admin_user()
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
      and p.status = 'active'
  )
$$;

alter table public.monitoring_templates enable row level security;
alter table public.monitoring_instances enable row level security;
alter table public.monitoring_reports enable row level security;

drop policy if exists monitoring_templates_select_policy on public.monitoring_templates;
create policy monitoring_templates_select_policy
  on public.monitoring_templates
  for select
  using (
    public.is_admin_user()
    or status = 'published'
  );

drop policy if exists monitoring_templates_admin_write_policy on public.monitoring_templates;
create policy monitoring_templates_admin_write_policy
  on public.monitoring_templates
  for all
  using (public.is_admin_user())
  with check (public.is_admin_user());

drop policy if exists monitoring_instances_select_policy on public.monitoring_instances;
create policy monitoring_instances_select_policy
  on public.monitoring_instances
  for select
  using (
    public.is_admin_user()
    or created_by = public.current_user_identifier()
  );

drop policy if exists monitoring_instances_insert_policy on public.monitoring_instances;
create policy monitoring_instances_insert_policy
  on public.monitoring_instances
  for insert
  with check (
    public.is_admin_user()
    or created_by = public.current_user_identifier()
  );

drop policy if exists monitoring_instances_update_policy on public.monitoring_instances;
create policy monitoring_instances_update_policy
  on public.monitoring_instances
  for update
  using (
    public.is_admin_user()
    or created_by = public.current_user_identifier()
  )
  with check (
    public.is_admin_user()
    or created_by = public.current_user_identifier()
  );

drop policy if exists monitoring_instances_delete_policy on public.monitoring_instances;
create policy monitoring_instances_delete_policy
  on public.monitoring_instances
  for delete
  using (
    public.is_admin_user()
    or created_by = public.current_user_identifier()
  );

drop policy if exists monitoring_reports_select_policy on public.monitoring_reports;
create policy monitoring_reports_select_policy
  on public.monitoring_reports
  for select
  using (
    public.is_admin_user()
    or created_by = public.current_user_identifier()
  );

drop policy if exists monitoring_reports_insert_policy on public.monitoring_reports;
create policy monitoring_reports_insert_policy
  on public.monitoring_reports
  for insert
  with check (
    public.is_admin_user()
    or created_by = public.current_user_identifier()
  );

drop policy if exists monitoring_reports_delete_policy on public.monitoring_reports;
create policy monitoring_reports_delete_policy
  on public.monitoring_reports
  for delete
  using (
    public.is_admin_user()
    or created_by = public.current_user_identifier()
  );

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  first_name text,
  last_name text,
  full_name text,
  role text default 'user' check (role in ('admin', 'user', 'especialista')),
  status text default 'active' check (status in ('active', 'disabled')),
  doc_type text,
  doc_number text,
  temp_credential text,
  avatar_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.profiles add column if not exists temp_credential text;
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check check (role in ('admin', 'user', 'especialista'));

alter table public.profiles enable row level security;

create policy "profiles_read_own"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id);

create policy "profiles_insert_own"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "profiles_admin_all"
  on public.profiles for all
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin' and p.status = 'active'
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin' and p.status = 'active'
    )
  );

create table if not exists public.monitoring_events (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  event_type text not null default 'monitoring' check (event_type in ('monitoring', 'activity')),
  description text,
  start_at timestamptz not null,
  end_at timestamptz not null,
  status text not null default 'active' check (status in ('active', 'hidden', 'closed')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.monitoring_event_responsibles (
  id uuid primary key default uuid_generate_v4(),
  event_id uuid not null references public.monitoring_events(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  level text not null check (level in ('initial', 'primary', 'secondary')),
  modality text not null check (modality in ('ebr', 'ebe')),
  course text,
  created_at timestamptz not null default now()
);

create table if not exists public.monitoring_event_objectives (
  id uuid primary key default uuid_generate_v4(),
  event_id uuid not null references public.monitoring_events(id) on delete cascade,
  objective_text text not null,
  completed boolean not null default false,
  order_index integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_monitoring_events_updated_at on public.monitoring_events;
create trigger set_monitoring_events_updated_at
before update on public.monitoring_events
for each row execute function public.set_updated_at();

drop trigger if exists set_monitoring_event_objectives_updated_at on public.monitoring_event_objectives;
create trigger set_monitoring_event_objectives_updated_at
before update on public.monitoring_event_objectives
for each row execute function public.set_updated_at();

alter table public.monitoring_events enable row level security;
alter table public.monitoring_event_responsibles enable row level security;
alter table public.monitoring_event_objectives enable row level security;

drop policy if exists monitoring_events_select_policy on public.monitoring_events;
create policy monitoring_events_select_policy
  on public.monitoring_events
  for select
  using (
    public.is_admin_user()
    or exists (
      select 1
      from public.monitoring_event_responsibles r
      where r.event_id = monitoring_events.id
        and r.user_id = auth.uid()
    )
  );

drop policy if exists monitoring_events_admin_write_policy on public.monitoring_events;
create policy monitoring_events_admin_write_policy
  on public.monitoring_events
  for all
  using (public.is_admin_user())
  with check (public.is_admin_user());

drop policy if exists monitoring_event_responsibles_select_policy on public.monitoring_event_responsibles;
create policy monitoring_event_responsibles_select_policy
  on public.monitoring_event_responsibles
  for select
  using (
    public.is_admin_user()
    or user_id = auth.uid()
  );

drop policy if exists monitoring_event_responsibles_admin_write_policy on public.monitoring_event_responsibles;
create policy monitoring_event_responsibles_admin_write_policy
  on public.monitoring_event_responsibles
  for all
  using (public.is_admin_user())
  with check (public.is_admin_user());

drop policy if exists monitoring_event_objectives_select_policy on public.monitoring_event_objectives;
create policy monitoring_event_objectives_select_policy
  on public.monitoring_event_objectives
  for select
  using (
    public.is_admin_user()
    or exists (
      select 1
      from public.monitoring_event_responsibles r
      where r.event_id = monitoring_event_objectives.event_id
        and r.user_id = auth.uid()
    )
  );

drop policy if exists monitoring_event_objectives_admin_write_policy on public.monitoring_event_objectives;
create policy monitoring_event_objectives_admin_write_policy
  on public.monitoring_event_objectives
  for all
  using (public.is_admin_user())
  with check (public.is_admin_user());
