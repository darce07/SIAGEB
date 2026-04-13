-- Business rule update for educational institutions:
-- - cod_local is not unique (a school can have multiple modular codes).
-- - cod_local can be non-numeric for specific cases (e.g. 'SIN COD LOC').

drop index if exists public.educational_institutions_cod_local_unique;

alter table public.educational_institutions
  drop constraint if exists educational_institutions_cod_local_numeric_check;

create index if not exists educational_institutions_cod_local_idx
  on public.educational_institutions ((trim(cod_local)));
