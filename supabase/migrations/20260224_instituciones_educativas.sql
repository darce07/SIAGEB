create extension if not exists "uuid-ossp";

create table if not exists public.educational_institutions (
  id uuid primary key default extensions.uuid_generate_v4(),
  nombre_ie text,
  cod_local text,
  cod_modular text,
  nivel text,
  modalidad text,
  distrito text,
  rei text,
  nombre_director text,
  estado text default 'active',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.educational_institutions
  add column if not exists nombre_ie text,
  add column if not exists cod_local text,
  add column if not exists cod_modular text,
  add column if not exists nivel text,
  add column if not exists modalidad text,
  add column if not exists distrito text,
  add column if not exists rei text,
  add column if not exists nombre_director text,
  add column if not exists estado text default 'active',
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

update public.educational_institutions
set
  estado = coalesce(nullif(trim(estado), ''), 'active'),
  created_at = coalesce(created_at, now()),
  updated_at = coalesce(updated_at, now())
where
  estado is null
  or trim(coalesce(estado, '')) = ''
  or created_at is null
  or updated_at is null;

alter table public.educational_institutions
  alter column nombre_ie set not null,
  alter column cod_local set not null,
  alter column cod_modular set not null,
  alter column nivel set not null,
  alter column modalidad set not null,
  alter column distrito set not null,
  alter column rei set not null,
  alter column nombre_director set not null,
  alter column estado set not null,
  alter column created_at set not null,
  alter column updated_at set not null,
  alter column estado set default 'active';

alter table public.educational_institutions
  drop constraint if exists educational_institutions_nivel_check,
  add constraint educational_institutions_nivel_check
    check (nivel in ('inicial', 'primaria', 'secundaria')),
  drop constraint if exists educational_institutions_modalidad_check,
  add constraint educational_institutions_modalidad_check
    check (modalidad in ('EBE', 'EBA', 'EBR')),
  drop constraint if exists educational_institutions_estado_check,
  add constraint educational_institutions_estado_check
    check (estado in ('active', 'inactive')),
  drop constraint if exists educational_institutions_cod_local_numeric_check,
  add constraint educational_institutions_cod_local_numeric_check
    check (cod_local ~ '^[0-9]+$'),
  drop constraint if exists educational_institutions_cod_modular_numeric_check,
  add constraint educational_institutions_cod_modular_numeric_check
    check (cod_modular ~ '^[0-9]+$');

create unique index if not exists educational_institutions_cod_local_unique
  on public.educational_institutions ((trim(cod_local)));

create unique index if not exists educational_institutions_cod_modular_unique
  on public.educational_institutions ((trim(cod_modular)));

create index if not exists educational_institutions_nombre_idx
  on public.educational_institutions (nombre_ie);

create index if not exists educational_institutions_nivel_idx
  on public.educational_institutions (nivel);

create index if not exists educational_institutions_modalidad_idx
  on public.educational_institutions (modalidad);

create index if not exists educational_institutions_distrito_idx
  on public.educational_institutions (distrito);

create index if not exists educational_institutions_rei_idx
  on public.educational_institutions (rei);

create index if not exists educational_institutions_estado_idx
  on public.educational_institutions (estado);

drop trigger if exists set_educational_institutions_updated_at on public.educational_institutions;
create trigger set_educational_institutions_updated_at
before update on public.educational_institutions
for each row execute function public.set_updated_at();

alter table public.educational_institutions enable row level security;

drop policy if exists educational_institutions_select_policy on public.educational_institutions;
create policy educational_institutions_select_policy
  on public.educational_institutions
  for select
  using (auth.uid() is not null);

drop policy if exists educational_institutions_admin_write_policy on public.educational_institutions;
create policy educational_institutions_admin_write_policy
  on public.educational_institutions
  for all
  using (public.is_admin_user())
  with check (public.is_admin_user());
