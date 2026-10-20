
# ============================================================
# EXECUTOR MULTI-TENANT - HOMOLOGACAO
# Inventario de Espacos Confinados NR-33
#
# Por padrao: somente prepara e valida o SQL.
# Nao executa migracoes sem autorizacao explicita.
# ============================================================

param(
    [switch]$Executar
)

$ErrorActionPreference = "Stop"

$psql = "C:\Program Files\PostgreSQL\17\bin\psql.exe"

$banco = "inventario_espacos_confinados_homolog"

$pasta = $PSScriptRoot

$migracao020 = Join-Path $pasta "020_multi_tenant_ambientes_convites.sql"
$migracao021 = Join-Path $pasta "021_multi_tenant_versionamento.sql"

# ============================================================
# 1. VALIDAR ARQUIVOS
# ============================================================

if (-not (Test-Path $psql)) {
    throw "psql.exe nao encontrado."
}

foreach ($arquivo in @($migracao020, $migracao021)) {
    if (-not (Test-Path $arquivo)) {
        throw "Arquivo nao encontrado: $arquivo"
    }
}

# ============================================================
# 2. PREPARAR CONTEUDO DAS MIGRACOES
# ============================================================

function Obter-Migracao {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Caminho
    )

    $conteudo = Get-Content -LiteralPath $Caminho -Raw

    # Impedir execucao de arquivos ainda em construcao.
    if ($conteudo -match '(?im)^\s*--\s*EM CONSTRUCAO') {
        throw "Migracao ainda em construcao: $Caminho"
    }

    # Remover apenas delimitadores externos.
    # Exigir um BEGIN inicial e um COMMIT final.
    $padrao = '(?s)\A(?<cabecalho>(?:\s*--[^\r\n]*(?:\r?\n|$)|\s+)*)BEGIN\s*;(?<corpo>.*)COMMIT\s*;\s*\z'

    $resultado = [regex]::Match($conteudo, $padrao)

    if (-not $resultado.Success) {
        throw "Estrutura de transacao invalida: $Caminho"
    }

    $corpo = $resultado.Groups["corpo"].Value

    if ([string]::IsNullOrWhiteSpace($corpo)) {
        throw "Migracao vazia: $Caminho"
    }

    return $corpo
}

# ============================================================
# 3. MONTAR TRANSACAO UNICA
# ============================================================

$sql020 = Obter-Migracao -Caminho $migracao020
$sql021 = Obter-Migracao -Caminho $migracao021

$sql = @"
\set ON_ERROR_STOP on

BEGIN;

$sql020

$sql021

COMMIT;
"@

$arquivoSaida = Join-Path $pasta "multi_tenant_homolog_gerado.sql"

# UTF-8 sem BOM.
$utf8 = New-Object System.Text.UTF8Encoding($false)

[System.IO.File]::WriteAllText(
    $arquivoSaida,
    $sql,
    $utf8
)

Write-Host ""
Write-Host "SQL preparado com sucesso."
Write-Host "Banco de destino: $banco"
Write-Host "Arquivo gerado: $arquivoSaida"
Write-Host ""

# ============================================================
# 4. MODO SEGURO - NAO EXECUTAR
# ============================================================

if (-not $Executar) {
    Write-Host "MODO SEGURO: nenhuma migracao foi executada."
    exit 0
}

# ============================================================
# 5. EXECUCAO CONTROLADA
# ============================================================

throw "Execucao bloqueada ate a conclusao da revisao tecnica."
