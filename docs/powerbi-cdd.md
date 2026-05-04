# Power BI - CDD Monitoreo

## Objetivo

Exponer a Power BI un modelo solo lectura para monitoreos de Compromiso de Desempeno (CDD), basado en meta, avance real y porcentaje de cumplimiento.

Power BI no debe conectarse con usuarios de la aplicacion ni con roles de escritura. Debe usar un usuario LOGIN separado que hereda exclusivamente el rol `pbi_reader`.

## Migracion principal

Archivo:

- `supabase/migrations/20260504110000_powerbi_cdd_readonly_views.sql`

La migracion crea:

- Schema `bi`
- Rol grupo `pbi_reader` sin login
- Funcion `bi.safe_numeric(text)` para normalizar numeros de formularios
- Vistas de dimensiones y hechos para Power BI
- Grants `select` solo sobre vistas BI aprobadas
- Revokes explicitos sobre `public` para evitar escritura o lectura directa de tablas base

## Usuario lector para Power BI

Despues de aplicar migraciones, ejecutar manualmente como admin:

- `supabase/sql/powerbi_reader_login_template.sql`

Antes de ejecutarlo, reemplazar `CHANGE_ME_USE_A_STRONG_PASSWORD` por una contrasena segura almacenada fuera del repositorio.

## Configuracion ODBC recomendada

No usar el usuario `postgres` ni `postgres.<project-ref>` para Power BI. Ese usuario es administrativo y no corresponde para reporteria.

Primero crear el usuario lector ejecutando:

- `supabase/sql/powerbi_reader_login_template.sql`

Luego configurar el DSN ODBC con estos valores:

- `Data Source`: `AGEBRE_PowerBI_CDD`
- `Database`: `postgres`
- `Server`: host del pooler o host directo de Supabase
- `Port`: `6543` si usas Supabase Pooler, `5432` si usas conexion directa
- `SSL Mode`: `require`
- `User Name` con Supabase Pooler: `pbi_powerbi_login.<project-ref>`
- `User Name` con conexion directa: `pbi_powerbi_login`
- `Password`: la contrasena segura definida para `pbi_powerbi_login`

En la captura ODBC, si el usuario aparece como `postgres...`, todavia no estas usando el rol lector.

Consulta rapida para validar permisos:

```sql
select * from bi.vw_powerbi_cdd_health;
```

Consultas que deben fallar para el usuario lector:

```sql
select * from public.monitoring_templates;
update bi.fact_cdd_monitoring_progress set meta = 0;
delete from bi.fact_cdd_monitoring_progress;
```

## Vistas disponibles

- `bi.dim_cdd_date`
- `bi.dim_cdd_monitoring`
- `bi.dim_cdd_responsible`
- `bi.fact_cdd_monitoring_progress`
- `bi.fact_cdd_area_summary`
- `bi.fact_cdd_dashboard_summary`
- `bi.vw_powerbi_cdd_health`

## Vista principal

Usar como tabla de hechos principal:

- `bi.fact_cdd_monitoring_progress`

Campos clave:

- `monitoring_id`
- `monitoring_title`
- `cdd_area`
- `monitoring_status_label`
- `responsible_names`
- `meta`
- `avance_real`
- `cumplimiento_pct`
- `brecha_meta`
- `last_change_at`

Regla de calculo:

- Si `meta <= 0`, `cumplimiento_pct = 0`
- Si `meta > 0`, `cumplimiento_pct = avance_real / meta * 100`
- El valor visual se limita entre `0` y `100`

## Relaciones sugeridas en Power BI

- `fact_cdd_monitoring_progress.monitoring_id` -> `dim_cdd_monitoring.monitoring_id`
- `fact_cdd_monitoring_progress.last_change_date_key` -> `dim_cdd_date.date_key`
- `fact_cdd_monitoring_progress.primary_responsible_id` -> `dim_cdd_responsible.responsible_id`

## Actualizacion de datos

Para ver cambios de avance o correcciones:

- `DirectQuery`: refleja cambios con mayor inmediatez, depende de conectividad y rendimiento.
- `Import + refresh programado`: mejor rendimiento, pero requiere programar actualizaciones.

La etapa 2 debe configurar Power BI Gateway para que Power BI Service pueda actualizar estos datos de forma segura.
