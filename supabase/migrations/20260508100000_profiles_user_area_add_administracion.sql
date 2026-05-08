alter table public.profiles
  drop constraint if exists profiles_user_area_check;

alter table public.profiles
  add constraint profiles_user_area_check
  check (
    user_area is null
    or user_area in (
      'ASGESE',
      'AGEBRE',
      'APP',
      'DIRECCION',
      'COPROA',
      'ADMINISTRACION',
      'RECURSOS HUMANOS',
      'RRHH'
    )
  );
