const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const codigo = fs.readFileSync(require.resolve('../src/server'), 'utf8');

for (const modo of [undefined, 'disabled', 'local-smtp', 'external-smtp']) test('entrada padrão inicia worker somente para transporte habilitado: ' + modo, async () => {
  const eventos = [], sinais = {};
  const habilitado = ['local-smtp', 'external-smtp'].includes(modo);
  const server = { close: () => eventos.push('close') };
  vm.runInNewContext(codigo, {
    console: { log() {} },
    process: { env: { EMAIL_TRANSPORT: modo }, once: (sinal, callback) => { sinais[sinal] = callback; } },
    require(nome) {
      if (nome === 'dotenv') return { config() {} };
      if (nome === './app') return { listen: () => server };
      if (nome === './services/recuperacaoSenhaWorker') return { iniciarWorker() {
        eventos.push('iniciar'); return async () => eventos.push('parar');
      } };
      if (nome === './config/database') return { end: async () => eventos.push('end') };
      throw Error('Import inesperado');
    },
  });
  assert.deepEqual(eventos, habilitado ? ['iniciar'] : []);
  if (habilitado) {
    await sinais.SIGTERM();
    assert.deepEqual(eventos, ['iniciar', 'parar', 'close', 'end']);
  } else assert.deepEqual(sinais, {});
});
