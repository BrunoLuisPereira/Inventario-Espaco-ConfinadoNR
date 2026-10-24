# Importacao pura. Nao abre janela, processo ou conexao.
function Solicitar-SenhaAdmin023 {
  Add-Type -AssemblyName System.Windows.Forms
  Add-Type -AssemblyName System.Drawing
  $janela023=New-Object Windows.Forms.Form
  $campo023=New-Object Windows.Forms.TextBox
  try {
    $janela023.Text='NR33 - migration 023 - entrada privada'
    $janela023.Size=New-Object Drawing.Size(610,240)
    $janela023.StartPosition='CenterScreen'
    $rotulo023=New-Object Windows.Forms.Label
    $rotulo023.Text="Destino: 127.0.0.1:5432/inventario_nr33_multitenant_dev`nPostgreSQL 17; operador: postgres. Senha nao sera salva."
    $rotulo023.SetBounds(20,15,560,55)
    $campo023.SetBounds(20,80,550,25)
    $campo023.UseSystemPasswordChar=$true
    $ok023=New-Object Windows.Forms.Button
    $ok023.Text='Autorizar migration 023'; $ok023.SetBounds(20,130,240,30); $ok023.DialogResult='OK'
    $cancelar023=New-Object Windows.Forms.Button
    $cancelar023.Text='Cancelar'; $cancelar023.SetBounds(300,130,140,30); $cancelar023.DialogResult='Cancel'
    $janela023.Controls.AddRange(@($rotulo023,$campo023,$ok023,$cancelar023))
    $janela023.AcceptButton=$ok023; $janela023.CancelButton=$cancelar023
    if ($janela023.ShowDialog() -ne 'OK' -or -not $campo023.Text) { return $null }
    return ConvertTo-SecureString $campo023.Text -AsPlainText -Force
  } finally { $campo023.Clear(); $janela023.Dispose() }
}
function Enviar-SenhaAdmin023([Security.SecureString]$Senha) {
  $processo023=$null; $ponteiro023=[IntPtr]::Zero; $texto023=$null; $json023=$null; $bytes023=$null
  try {
    $node023=(Get-Command node.exe -CommandType Application -ErrorAction Stop).Source
    $inicio023=New-Object Diagnostics.ProcessStartInfo
    $inicio023.FileName=$node023
    $inicio023.Arguments='"'+(Join-Path $PSScriptRoot 'migration-023-canal.cjs')+'"'
    $inicio023.UseShellExecute=$false; $inicio023.CreateNoWindow=$true
    $inicio023.RedirectStandardInput=$true; $inicio023.RedirectStandardOutput=$true; $inicio023.RedirectStandardError=$true
    # Sem credenciais herdadas, NODE_OPTIONS, PG*, JWT ou HMAC no filho.
    $inicio023.EnvironmentVariables.Clear()
    foreach($nome023 in @('SystemRoot','WINDIR','TEMP','TMP')) {
      $valor023=[Environment]::GetEnvironmentVariable($nome023,'Process')
      if ($null -ne $valor023) { $inicio023.EnvironmentVariables[$nome023]=$valor023 }
    }
    $processo023=New-Object Diagnostics.Process
    $processo023.StartInfo=$inicio023
    [void]$processo023.Start()
    $saida023=$processo023.StandardOutput.ReadToEndAsync()
    $erro023=$processo023.StandardError.ReadToEndAsync()
    $ponteiro023=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($Senha)
    $texto023=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($ponteiro023)
    $json023=@{banco='inventario_nr33_multitenant_dev';operador='postgres';senha=$texto023;confirmacao='APLICAR 023 inventario_nr33_multitenant_dev'} | ConvertTo-Json -Compress
    $bytes023=[Text.Encoding]::UTF8.GetBytes($json023)
    $processo023.StandardInput.BaseStream.Write($bytes023,0,$bytes023.Length)
    $processo023.StandardInput.BaseStream.Flush()
    $processo023.StandardInput.Close()
    $processo023.WaitForExit()
    [void]$saida023.GetAwaiter().GetResult(); [void]$erro023.GetAwaiter().GetResult()
    if ($processo023.ExitCode -ne 0) { throw 'Operacao interrompida.' }
  } finally {
    if ($ponteiro023 -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ponteiro023) }
    $texto023=$null; $json023=$null
    if ($null -ne $bytes023) { [Array]::Clear($bytes023,0,$bytes023.Length); $bytes023=$null }
    if ($null -ne $processo023) {
      try { if (-not $processo023.HasExited) { $processo023.Kill(); $processo023.WaitForExit() } } catch { }
      $processo023.Dispose()
    }
  }
}
function Invocar-MigrationAdmin023([string]$Banco,[bool]$Executar,[string]$Confirmacao) {
  $senha023=$null
  # Ambiente do chamador nunca e alterado; preservar inclusive em cancelamento/falha.
  try {
    if ($Banco -cne 'inventario_nr33_multitenant_dev' -or -not $Executar -or
        $Confirmacao -cne 'APLICAR 023 inventario_nr33_multitenant_dev') { throw 'Destino ou autorizacao recusados.' }
    $senha023=Solicitar-SenhaAdmin023
    if ($null -eq $senha023) { return 'Cancelado; nenhuma conexao iniciada.' }
    Enviar-SenhaAdmin023 $senha023
    return 'Migration 023 concluida no destino isolado.'
  } catch { throw 'Migration 023 recusada ou interrompida; revisar estado antes de repetir. Nenhuma credencial foi registrada.' }
  finally { if ($null -ne $senha023) { $senha023.Dispose() }; $senha023=$null }
}
