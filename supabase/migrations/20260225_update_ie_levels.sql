alter table public.educational_institutions
  drop constraint if exists educational_institutions_nivel_check;

update public.educational_institutions
set nivel = 'inicial_jardin'
where nivel = 'inicial';

alter table public.educational_institutions
  add constraint educational_institutions_nivel_check
    check (nivel in ('inicial_cuna_jardin', 'inicial_jardin', 'primaria', 'secundaria'));
