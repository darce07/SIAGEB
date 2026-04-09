param(
  [string]$InputCsv = "C:\Users\Anvorguesa\Downloads\Data_UGEL06 (1).csv",
  [string]$OutputDir = ".\supabase\import",
  [int]$ChunkSize = 500
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Normalize-Text([object]$Value) {
  $text = [string]$Value
  if ($null -eq $text) { return "" }
  return ($text.Trim() -replace "\s{2,}", " ")
}

function Normalize-Code([object]$Value) {
  $text = Normalize-Text $Value
  if (-not $text) { return "" }
  return ($text -replace "\s+", "")
}

function Normalize-Ascii([string]$Value) {
  if (-not $Value) { return "" }
  $normalized = $Value.Normalize([Text.NormalizationForm]::FormD)
  $builder = New-Object System.Text.StringBuilder
  foreach ($ch in $normalized.ToCharArray()) {
    $unicode = [Globalization.CharUnicodeInfo]::GetUnicodeCategory($ch)
    if ($unicode -ne [Globalization.UnicodeCategory]::NonSpacingMark) {
      [void]$builder.Append($ch)
    }
  }
  return $builder.ToString()
}

function Normalize-Level([string]$RawLevel) {
  $level = Normalize-Ascii((Normalize-Text $RawLevel).ToLowerInvariant())

  if ($level -match "tecnic.*productiv") { return "tecnico_productiva" }

  if ($level -match "basica alternativa") {
    if ($level -match "avanzado") { return "secundaria" }
    if ($level -match "intermedio|inicial") { return "primaria" }
    return "secundaria"
  }

  if ($level -match "secundaria") { return "secundaria" }
  if ($level -match "primaria") { return "primaria" }
  if ($level -match "cuna") { return "inicial_cuna_jardin" }
  if ($level -match "inicial") { return "inicial_jardin" }

  return ""
}

function Normalize-Modality([string]$RawLevel) {
  $level = Normalize-Ascii((Normalize-Text $RawLevel).ToLowerInvariant())

  if ($level -match "basica especial") { return "EBE" }
  if ($level -match "basica alternativa") { return "EBA" }
  return "EBR"
}

function Normalize-Status([string]$RawStatus) {
  $status = Normalize-Ascii((Normalize-Text $RawStatus).ToLowerInvariant())
  if ($status -match "inactivo|inactive") { return "inactive" }
  return "active"
}

function Parse-DateSafe([string]$Value) {
  $text = Normalize-Text $Value
  if (-not $text) { return [datetime]::MinValue }
  $formats = @("dd-MM-yyyy", "d-M-yyyy", "yyyy-MM-dd", "dd/MM/yyyy")
  foreach ($format in $formats) {
    try {
      return [datetime]::ParseExact($text, $format, [Globalization.CultureInfo]::InvariantCulture)
    } catch {
      continue
    }
  }
  return [datetime]::MinValue
}

function Escape-Sql([string]$Value) {
  return ($Value -replace "'", "''")
}

if (-not (Test-Path -Path $InputCsv -PathType Leaf)) {
  throw "No se encontro el archivo CSV: $InputCsv"
}

if (-not (Test-Path -Path $OutputDir -PathType Container)) {
  New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
}

$rows = Import-Csv -Path $InputCsv -Delimiter ';'
if (-not $rows -or $rows.Count -eq 0) {
  throw "El archivo CSV no tiene filas."
}

$requiredColumns = @("CEN_EDU", "CODLOCAL", "COD_MOD", "D_NIV_MOD", "D_DIST", "REI", "DIRECTOR", "D_ESTADO", "FECHA_ACT")
$availableColumns = @($rows[0].PSObject.Properties.Name)
$missingColumns = @($requiredColumns | Where-Object { $_ -notin $availableColumns })
if ($missingColumns.Count -gt 0) {
  throw "Faltan columnas requeridas en el CSV: $($missingColumns -join ', ')"
}

$normalizedRows = New-Object System.Collections.Generic.List[object]
$rejectedRows = New-Object System.Collections.Generic.List[object]
$fallbackCodLocalCount = 0

$lineNumber = 1
foreach ($row in $rows) {
  $lineNumber += 1

  $nombreIe = Normalize-Text $row.CEN_EDU
  $codLocal = Normalize-Code $row.CODLOCAL
  $codModular = Normalize-Code $row.COD_MOD
  if (-not $codLocal -and $codModular) {
    $codLocal = $codModular
    $fallbackCodLocalCount += 1
  }
  $rawLevel = Normalize-Text $row.D_NIV_MOD
  $nivel = Normalize-Level $rawLevel
  $modalidad = Normalize-Modality $rawLevel
  $distrito = Normalize-Text $row.D_DIST
  $rei = Normalize-Text $row.REI
  $director = Normalize-Text $row.DIRECTOR
  $estado = Normalize-Status $row.D_ESTADO
  $fechaAct = Parse-DateSafe $row.FECHA_ACT

  if (-not $rei) { $rei = "SIN REI" }
  if (-not $director) { $director = "NO REGISTRADO" }

  $errors = New-Object System.Collections.Generic.List[string]

  if (-not $nombreIe) { [void]$errors.Add("nombre_ie vacío") }
  if (-not $codLocal) { [void]$errors.Add("cod_local vacío") }
  if (-not $codModular) { [void]$errors.Add("cod_modular vacío") }
  if ($codLocal -and $codLocal -notmatch "^\d+$") { [void]$errors.Add("cod_local no numérico") }
  if ($codModular -and $codModular -notmatch "^\d+$") { [void]$errors.Add("cod_modular no numérico") }
  if (-not $nivel) { [void]$errors.Add("nivel no soportado: '$rawLevel'") }
  if (-not $distrito) { [void]$errors.Add("distrito vacío") }
  if (-not $modalidad) { [void]$errors.Add("modalidad vacía") }

  if ($errors.Count -gt 0) {
    $rejectedRows.Add([pscustomobject]@{
        line = $lineNumber
        cod_modular = $codModular
        nombre_ie = $nombreIe
        motivo = ($errors -join " | ")
      }) | Out-Null
    continue
  }

  $normalizedRows.Add([pscustomobject]@{
      nombre_ie = $nombreIe
      cod_local = $codLocal
      cod_modular = $codModular
      nivel = $nivel
      modalidad = $modalidad
      distrito = $distrito
      rei = $rei
      nombre_director = $director
      estado = $estado
      _fecha_act = $fechaAct
      _line = $lineNumber
    }) | Out-Null
}

$finalRows = New-Object System.Collections.Generic.List[object]
$duplicateGroups = @($normalizedRows | Group-Object cod_modular | Where-Object { $_.Count -gt 1 })

foreach ($group in ($normalizedRows | Group-Object cod_modular)) {
  $picked = $group.Group |
    Sort-Object `
      @{ Expression = { if ($_.estado -eq "active") { 0 } else { 1 } } }, `
      @{ Expression = { $_._fecha_act }; Descending = $true }, `
      @{ Expression = { $_._line }; Descending = $false } |
    Select-Object -First 1

  $finalRows.Add([pscustomobject]@{
      nombre_ie = $picked.nombre_ie
      cod_local = $picked.cod_local
      cod_modular = $picked.cod_modular
      nivel = $picked.nivel
      modalidad = $picked.modalidad
      distrito = $picked.distrito
      rei = $picked.rei
      nombre_director = $picked.nombre_director
      estado = $picked.estado
    }) | Out-Null
}

$finalRows = $finalRows | Sort-Object cod_modular

$cleanCsvPath = Join-Path $OutputDir "educational_institutions_ugel06_clean.csv"
$finalRows | Export-Csv -Path $cleanCsvPath -NoTypeInformation -Encoding UTF8

$rejectedCsvPath = Join-Path $OutputDir "educational_institutions_ugel06_rejected.csv"
if ($rejectedRows.Count -gt 0) {
  $rejectedRows | Export-Csv -Path $rejectedCsvPath -NoTypeInformation -Encoding UTF8
} else {
  if (Test-Path $rejectedCsvPath) { Remove-Item $rejectedCsvPath -Force }
}

$sqlPath = Join-Path $OutputDir "educational_institutions_ugel06_upsert.sql"
$sqlLines = New-Object System.Collections.Generic.List[string]
$sqlLines.Add("-- Generado automaticamente por scripts/prepare_ie_import.ps1")
$sqlLines.Add("-- Fecha: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')")
$sqlLines.Add("-- Fuente: $InputCsv")
$sqlLines.Add("")
$sqlLines.Add("begin;")
$sqlLines.Add("")

for ($offset = 0; $offset -lt $finalRows.Count; $offset += $ChunkSize) {
  $chunk = @($finalRows | Select-Object -Skip $offset -First $ChunkSize)
  if (-not $chunk) { continue }

  $sqlLines.Add("insert into public.educational_institutions (")
  $sqlLines.Add("  nombre_ie, cod_local, cod_modular, nivel, modalidad, distrito, rei, nombre_director, estado")
  $sqlLines.Add(")")
  $sqlLines.Add("values")

  for ($i = 0; $i -lt $chunk.Count; $i++) {
    $r = $chunk[$i]
    $tuple = "  ('{0}','{1}','{2}','{3}','{4}','{5}','{6}','{7}','{8}')" -f `
      (Escape-Sql $r.nombre_ie), `
      (Escape-Sql $r.cod_local), `
      (Escape-Sql $r.cod_modular), `
      (Escape-Sql $r.nivel), `
      (Escape-Sql $r.modalidad), `
      (Escape-Sql $r.distrito), `
      (Escape-Sql $r.rei), `
      (Escape-Sql $r.nombre_director), `
      (Escape-Sql $r.estado)

    if ($i -lt ($chunk.Count - 1)) {
      $tuple = "$tuple,"
    }
    $sqlLines.Add($tuple)
  }

  $sqlLines.Add("on conflict ((trim(cod_modular))) do update set")
  $sqlLines.Add("  nombre_ie = excluded.nombre_ie,")
  $sqlLines.Add("  cod_local = excluded.cod_local,")
  $sqlLines.Add("  nivel = excluded.nivel,")
  $sqlLines.Add("  modalidad = excluded.modalidad,")
  $sqlLines.Add("  distrito = excluded.distrito,")
  $sqlLines.Add("  rei = excluded.rei,")
  $sqlLines.Add("  nombre_director = excluded.nombre_director,")
  $sqlLines.Add("  estado = excluded.estado,")
  $sqlLines.Add("  updated_at = now();")
  $sqlLines.Add("")
}

$sqlLines.Add("commit;")

$sqlLines | Set-Content -Path $sqlPath -Encoding UTF8

Write-Output "==== RESUMEN PREPARACION IE ===="
Write-Output "Fuente CSV: $InputCsv"
Write-Output "Filas fuente: $($rows.Count)"
Write-Output "Filas normalizadas validas: $($normalizedRows.Count)"
Write-Output "Filas finales (dedupe por cod_modular): $($finalRows.Count)"
Write-Output "Codigos modulares duplicados detectados: $($duplicateGroups.Count)"
Write-Output "Filas con cod_local completado desde cod_modular: $fallbackCodLocalCount"
Write-Output "Filas rechazadas: $($rejectedRows.Count)"
Write-Output "CSV limpio: $cleanCsvPath"
Write-Output "SQL upsert: $sqlPath"
if ($rejectedRows.Count -gt 0) {
  Write-Output "CSV rechazados: $rejectedCsvPath"
}
