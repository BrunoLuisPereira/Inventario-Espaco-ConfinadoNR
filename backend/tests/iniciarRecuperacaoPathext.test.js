const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
test('launcher isolado resolve node sem extensão e não herda NODE_OPTIONS', { skip: process.platform !== 'win32' }, () => {
  const resultado = execFileSync('powershell.exe', ['-NoProfile', '-File', path.join(__dirname, 'helpers/inicioRecuperacaoPathextTeste.ps1')],
    { encoding: 'utf8', windowsHide: true, timeout: 20000 });
  assert.match(resultado, /APROVADO: node resolvido via PATHEXT/);
});
