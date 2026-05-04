-- Power BI read-only LOGIN template.
-- Run manually as database owner/admin after applying migrations.
-- Replace the password with a strong secret stored outside the repository.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'pbi_powerbi_login') then
    create role pbi_powerbi_login
      login
      password 'CHANGE_ME_USE_A_STRONG_PASSWORD'
      connection limit 5;
  end if;
end
$$;

grant pbi_reader to pbi_powerbi_login;

alter role pbi_powerbi_login set statement_timeout = '30s';
alter role pbi_powerbi_login set idle_in_transaction_session_timeout = '30s';
alter role pbi_powerbi_login set search_path = 'bi';

-- Optional rotation example:
-- alter role pbi_powerbi_login password 'NEW_STRONG_PASSWORD';
