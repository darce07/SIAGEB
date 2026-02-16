-- Prevent removing the last active admin (defense in depth).
-- Blocks UPDATE/DELETE that would leave the system without an active admin.

create or replace function public.guard_last_active_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  admin_count integer;
begin
  if (tg_op = 'DELETE') then
    if old.role = 'admin' and old.status = 'active' then
      select count(*) into admin_count
      from public.profiles
      where role = 'admin' and status = 'active';

      if admin_count <= 1 then
        raise exception 'No puedes eliminar al ultimo administrador activo.';
      end if;
    end if;
    return old;
  end if;

  if (tg_op = 'UPDATE') then
    if old.role = 'admin'
      and old.status = 'active'
      and (new.role is distinct from 'admin' or new.status is distinct from 'active') then
      select count(*) into admin_count
      from public.profiles
      where role = 'admin' and status = 'active';

      if admin_count <= 1 then
        raise exception 'No puedes quitar o desactivar al ultimo administrador activo.';
      end if;
    end if;
    return new;
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_guard_last_active_admin on public.profiles;
create trigger profiles_guard_last_active_admin
before update or delete on public.profiles
for each row execute function public.guard_last_active_admin();

