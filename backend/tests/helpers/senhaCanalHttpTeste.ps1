$ErrorActionPreference='Stop'
$encodingAntesSenhaTeste=$OutputEncoding
$campoSenhaTeste=$null
try {
  Add-Type -AssemblyName System.Windows.Forms
  # Mesmo tipo de campo da janela; sem Show/ShowDialog e sem senha real.
  $campoSenhaTeste=New-Object Windows.Forms.TextBox
  $campoSenhaTeste.UseSystemPasswordChar=$true
  $script:execucaoProibidaSenhaTeste=$false
  function Marcar-ExecucaoProibida { $script:execucaoProibidaSenhaTeste=$true;throw 'Execucao proibida.' }
  $casosSenhaTeste=@(
    @('letras_numeros','Abc12345'),
    @('especiais','!@#%^&*()_+-=[]{};:,.?/|\'),
    @('acentos',('Senha'+[char]0xc1+[char]0xe9+[char]0xe7+[char]0xe3+'123')),
    @('espacos','  senha com  espacos  '),
    @('powershell','$(Marcar-ExecucaoProibida); ${env:PATH} & | > < ` " '' \'),
    @('unicode',('Senha-'+[char]0x6f22+[char]::ConvertFromUtf32(0x1f4a1)+'e'+[char]0x301))
  )
  $configSenhaTeste=@()
  foreach($casoSenhaTeste in $casosSenhaTeste) {
    $campoSenhaTeste.Text=$casoSenhaTeste[1]
    $seguroSenhaTeste=ConvertTo-SecureString $campoSenhaTeste.Text -AsPlainText -Force
    $ptrSenhaTeste=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($seguroSenhaTeste)
    try {
      $textoSenhaTeste=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptrSenhaTeste)
      if($textoSenhaTeste -cne $casoSenhaTeste[1]){throw 'Integridade do campo recusada.'}
      $configSenhaTeste+=@{categoria=$casoSenhaTeste[0];senha=$textoSenhaTeste}
    } finally {
      [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptrSenhaTeste)
      $seguroSenhaTeste.Dispose();$campoSenhaTeste.Clear();$textoSenhaTeste=$null
    }
  }
  # Mesmo canal do PASSO 29.7.5: ConvertTo-Json, OutputEncoding UTF8, pipe nativo.
  $jsonSenhaTeste=$configSenhaTeste | ConvertTo-Json -Compress
  $OutputEncoding=New-Object Text.UTF8Encoding($false)
  $jsonSenhaTeste | & node.exe (Join-Path $PSScriptRoot 'senhaCanalHttpMock.cjs')
  if($LASTEXITCODE -ne 0 -or $script:execucaoProibidaSenhaTeste){throw 'Teste de canal recusado.'}
} catch {
  [Console]::Error.WriteLine('TESTE_SINTETICO_POWERSHELL_FALHOU')
  exit 1
} finally {
  $OutputEncoding=$encodingAntesSenhaTeste
  if($campoSenhaTeste){$campoSenhaTeste.Clear();$campoSenhaTeste.Dispose()}
  if($configSenhaTeste){foreach($itemSenhaTeste in $configSenhaTeste){$itemSenhaTeste.senha=$null}}
  $jsonSenhaTeste=$null
}
