# Funções puras de configuração. Importar não altera o ambiente nem gera segredos.
function Salvar-AmbienteLocal([string[]]$Nomes) {
  $estadoLocal = @{}
  foreach ($nomeLocal in $Nomes) {
    $estadoLocal[$nomeLocal] = [Environment]::GetEnvironmentVariable($nomeLocal, 'Process')
  }
  return $estadoLocal
}
function Restaurar-AmbienteLocal([hashtable]$Estado) {
  foreach ($nomeLocal in $Estado.Keys) {
    [Environment]::SetEnvironmentVariable($nomeLocal, $Estado[$nomeLocal], 'Process')
  }
}
function Testar-HmacLocal([string]$Valor) {
  if ($Valor -cnotmatch '\A[A-Za-z0-9+/]{43}=\z') { return $false }
  try {
    $bytesLocal = [Convert]::FromBase64String($Valor)
    return $bytesLocal.Length -eq 32 -and [Convert]::ToBase64String($bytesLocal) -ceq $Valor
  } catch { return $false }
}
