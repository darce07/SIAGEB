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

alter table public.monitoring_templates disable row level security;
alter table public.monitoring_instances disable row level security;
alter table public.monitoring_reports disable row level security;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  first_name text,
  last_name text,
  full_name text,
  role text default 'user' check (role in ('admin', 'user')),
  status text default 'active' check (status in ('active', 'disabled')),
  doc_type text,
  doc_number text,
  avatar_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

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
