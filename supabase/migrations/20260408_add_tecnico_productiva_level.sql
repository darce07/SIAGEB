alter table public.educational_institutions
  drop constraint if exists educational_institutions_nivel_check;

update public.educational_institutions
set nivel = 'tecnico_productiva'
where lower(trim(nivel)) in ('tecnico productiva', 'tecnico-productiva', 'tecnico_productiva');

alter table public.educational_institutions
  add constraint educational_institutions_nivel_check
    check (
      nivel in (
        'inicial_cuna_jardin',
        'inicial_jardin',
        'primaria',
        'secundaria',
        'tecnico_productiva'
      )
    );
