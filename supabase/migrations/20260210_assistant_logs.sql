create table if not exists public.assistant_logs (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete set null,
  role text not null check (role in ('user', 'assistant')),
  message text not null,
  source text default 'chat',
  approved boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.assistant_logs enable row level security;

drop policy if exists assistant_logs_admin_read on public.assistant_logs;
create policy assistant_logs_admin_read
  on public.assistant_logs
  for select
  using (public.is_admin_user());

drop policy if exists assistant_logs_admin_update on public.assistant_logs;
create policy assistant_logs_admin_update
  on public.assistant_logs
  for update
  using (public.is_admin_user())
  with check (public.is_admin_user());
