# Execucao autorizada do PASSO 715. Credenciais nunca sao impressas.
$ErrorActionPreference='Stop'
foreach($chave715 in @('NODE_OPTIONS','DATABASE_URL','DB_PASSWORD','JWT_SECRET','PGPASSWORD','PGPASSFILE','PGSERVICE','PGSERVICEFILE','PGOPTIONS','PGHOSTADDR','PGHOST','PGPORT','PGDATABASE','PGUSER','PGSSLMODE','PGTARGETSESSIONATTRS','NR33_SENHA_INSTALACAO','NR33_CREDENCIAL_715','NR33_EXECUCAO_715')) {
  if(Test-Path -LiteralPath "Env:$chave715") { throw 'Sessao nao isolada; execucao715 recusada.' }
}
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$form715=New-Object Windows.Forms.Form
$form715.Text='NR33 — instalação autorizada do banco NOVO'
$form715.Size=New-Object Drawing.Size(610,265)
$form715.StartPosition='CenterScreen'; $form715.TopMost=$true
$texto715=New-Object Windows.Forms.Label
$texto715.Location=New-Object Drawing.Point(20,15); $texto715.Size=New-Object Drawing.Size(560,90)
$texto715.Text="Destino único: 127.0.0.1:5432/inventario_nr33_multitenant_dev`nUsuário instalador: postgres`nDigite a senha administrativa abaixo. Ela não será salva.`nUma senha nova da aplicação será gerada e salva criptografada por DPAPI, fora do Git."
$campo715=New-Object Windows.Forms.TextBox
$campo715.Location=New-Object Drawing.Point(20,115); $campo715.Width=550; $campo715.UseSystemPasswordChar=$true
$ok715=New-Object Windows.Forms.Button
$ok715.Text='Autorizar entrada privada'; $ok715.Location=New-Object Drawing.Point(20,160); $ok715.Width=230; $ok715.DialogResult='OK'
$cancelar715=New-Object Windows.Forms.Button
$cancelar715.Text='Cancelar'; $cancelar715.Location=New-Object Drawing.Point(275,160); $cancelar715.Width=130; $cancelar715.DialogResult='Cancel'
$form715.Controls.AddRange(@($texto715,$campo715,$ok715,$cancelar715)); $form715.AcceptButton=$ok715; $form715.CancelButton=$cancelar715
if($form715.ShowDialog() -ne 'OK' -or -not $campo715.Text) { $form715.Dispose(); throw 'Entrada privada cancelada; nenhuma instalacao executada.' }
$senhaAdmin715=ConvertTo-SecureString $campo715.Text -AsPlainText -Force
$campo715.Clear(); $form715.Dispose()
$senhaApp715=ConvertTo-SecureString ([Guid]::NewGuid().ToString('N')+[Guid]::NewGuid().ToString('N')) -AsPlainText -Force
function Texto-Privado715([Security.SecureString]$Senha) {
  $ponteiro715=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($Senha)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ponteiro715) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ponteiro715) }
}
$fase715='preflight'
try {
  $env:NR33_EXECUCAO_715='inventario_nr33_multitenant_dev'
  $env:NR33_CREDENCIAL_715=Texto-Privado715 $senhaAdmin715
  & node (Join-Path $PSScriptRoot 'validar-715.cjs') preflight
  if($LASTEXITCODE -ne 0) { throw 'Preflight recusado.' }
  Remove-Item -LiteralPath Env:NR33_CREDENCIAL_715
  # Diretorio exclusivo com ACL apenas do usuario atual; segredo DPAPI CurrentUser.
  $sid715=[Security.Principal.WindowsIdentity]::GetCurrent().User
  $acl715=New-Object Security.AccessControl.DirectorySecurity
  $acl715.SetOwner($sid715); $acl715.SetAccessRuleProtection($true,$false)
  $regra715=New-Object Security.AccessControl.FileSystemAccessRule($sid715,'FullControl','ContainerInherit,ObjectInherit','None','Allow')
  $acl715.AddAccessRule($regra715)
  $privado715=Join-Path $env:LOCALAPPDATA ('NR33-Dev-Privado\passo715-'+[Guid]::NewGuid().ToString('N'))
  [void][IO.Directory]::CreateDirectory($privado715,$acl715)
  $arquivo715=Join-Path $privado715 'aplicacao.clixml'
  $credencial715=New-Object Management.Automation.PSCredential('nr33_dev_app',$senhaApp715)
  $credencial715 | Export-Clixml -LiteralPath $arquivo715
  $recuperada715=Import-Clixml -LiteralPath $arquivo715
  if($recuperada715.UserName -cne 'nr33_dev_app' -or $recuperada715.GetNetworkCredential().Password -cne $credencial715.GetNetworkCredential().Password) { throw 'Recuperacao privada nao comprovada.' }
  Write-Output "CREDENCIAL_DPAPI: $arquivo715"
  $fase715='instalacao'
  & (Join-Path $PSScriptRoot 'postgres-local.ps1') -Etapa Instalar -Banco inventario_nr33_multitenant_dev -Executar -Confirmacao 'INSTALAR inventario_nr33_multitenant_dev' -SenhaAdministrador $senhaAdmin715 -SenhaAplicacao $senhaApp715
  $fase715='validacao'
  $env:NR33_CREDENCIAL_715=Texto-Privado715 $senhaApp715
  & node (Join-Path $PSScriptRoot 'validar-715.cjs') validar
  if($LASTEXITCODE -ne 0) { throw 'Validacao real falhou.' }
  Write-Output 'PASSO715_OK: instalacao e validacoes PostgreSQL concluidas.'
} catch {
  Write-Output "PASSO715_INTERROMPIDO: fase=$fase715; sem reset ou exclusao automatica."
  exit 1
} finally {
  Remove-Item -LiteralPath Env:NR33_CREDENCIAL_715 -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath Env:NR33_EXECUCAO_715 -ErrorAction SilentlyContinue
  $senhaAdmin715=$null; $senhaApp715=$null; $recuperada715=$null; $credencial715=$null
}
