create extension if not exists pgcrypto with schema extensions;

create table if not exists public.monitoring_requests (
  id uuid primary key default extensions.gen_random_uuid(),
  code text not null unique,
  name text not null,
  detail text not null default '',
  start_date timestamptz,
  end_date timestamptz,
  cdd text not null default 'no' check (cdd in ('si', 'no')),
  management_filters jsonb not null default '[]'::jsonb,
  modality_filters jsonb not null default '[]'::jsonb,
  type_filters jsonb not null default '[]'::jsonb,
  level_filters jsonb not null default '[]'::jsonb,
  restriction text not null default 'none' check (restriction in ('none', 'cod_local', 'cod_modular')),
  institutions jsonb not null default '[]'::jsonb,
  sheets jsonb not null default '[]'::jsonb,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'expired', 'rejected', 'published')),
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists monitoring_requests_status_idx
  on public.monitoring_requests (status);

create index if not exists monitoring_requests_updated_at_idx
  on public.monitoring_requests (updated_at desc);

drop trigger if exists set_monitoring_requests_updated_at on public.monitoring_requests;
create trigger set_monitoring_requests_updated_at
before update on public.monitoring_requests
for each row execute function public.set_updated_at();

alter table public.monitoring_requests enable row level security;

drop policy if exists monitoring_requests_admin_select_policy on public.monitoring_requests;
create policy monitoring_requests_admin_select_policy
  on public.monitoring_requests
  for select
  using (public.is_admin_user());

drop policy if exists monitoring_requests_admin_write_policy on public.monitoring_requests;
create policy monitoring_requests_admin_write_policy
  on public.monitoring_requests
  for all
  using (public.is_admin_user())
  with check (public.is_admin_user());
