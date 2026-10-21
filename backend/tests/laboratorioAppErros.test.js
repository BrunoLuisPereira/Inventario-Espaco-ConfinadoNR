const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const express = require('express');
const normalizarId = require('../src/utils/normalizarIdDominio');

// Carrega o código real com require fechado: nenhum router de produção,
// driver, dotenv ou utilitário físico pode ser carregado incidentalmente.
function carregar(arquivo, dependencias) {
  const filename = path.resolve(__dirname, arquivo);
  const modulo = { exports: {} };
  const executar = vm.runInThisContext(
    '(function(require, module, exports) {\n' + fs.readFileSync(filename, 'utf8') + '\n})',
    { filename },
  );
  executar(nome => {
    assert.ok(Object.hasOwn(dependencias, nome), 'Dependência inesperada: ' + nome);
    return dependencias[nome];
  }, modulo, modulo.exports);
  return modulo.exports;
}

function preparar(router = express.Router()) {
  let tratarErro;
  function expressCapturado() {
    const app = express();
    const use = app.use;
    app.use = function (...args) {
      if (args.length === 1 && args[0].length === 4) tratarErro = args[0];
      return use.apply(this, args);
    };
    return app;
  }
  expressCapturado.json = express.json;
  const dependencias = {
    express: expressCapturado,
    './config.cjs': carregar('../laboratorio/config.cjs', {}),
  };
  for (const nome of ['cadastro', 'convite', 'auth', 'usuario', 'campanha', 'local',
    'checklist', 'dadosTecnicos', 'relatorio', 'evidencia', 'sincronizacao']) {
    dependencias['../src/routes/' + nome + 'Routes'] = router;
  }
  const { criarApp } = carregar('../laboratorio/app.cjs', dependencias);
  const app = criarApp('inventario_nr33_multitenant_dev');
  assert.equal(typeof tratarErro, 'function');
  return { app, tratarErro };
}

function responder(error, headersSent = false) {
  const { tratarErro } = preparar();
  const chamadas = [];
  const res = {
    headersSent,
    status(code) { chamadas.push(['status', code]); return this; },
    json(body) { chamadas.push(['json', body]); this.headersSent = true; return this; },
  };
  const encaminhados = [];
  tratarErro(error, {}, res, e => encaminhados.push(e));
  return { chamadas, encaminhados, res, tratarErro };
}

function verificar(error, status, message) {
  const { chamadas, encaminhados } = responder(error);
  assert.deepEqual(chamadas, [['status', status], ['json', { status: 'error', message }]]);
  assert.deepEqual(encaminhados, []);
}
const generica = 'Erro interno do servidor.';
for (const statusCode of [400, 401, 403, 404, 409, 410, 422]) {
  test('app real preserva erro controlado ' + statusCode, () => {
    verificar(Object.assign(new Error('Mensagem pública controlada.'), { statusCode }),
      statusCode, 'Mensagem pública controlada.');
  });
}
for (const valor of [undefined, null, '404', true, false, [], {}, 400.5, NaN,
  Infinity, -1, 0, 200, 399, 418, 499, 600]) {
  test('status inválido ou não reconhecido: ' + String(valor), () => {
    verificar(Object.assign(new Error('DETALHE_INTERNO'), { statusCode: valor }), 500, generica);
  });
}
for (const statusCode of [500, 501, 503, 599]) {
  test('sanitiza erro ' + statusCode, () => {
    verificar(Object.assign(new Error('SQL senha token caminho stack'), { statusCode }), 500, generica);
  });
}
test('erro técnico sem status e erro com somente status não são públicos', () => {
  verificar(new Error('STACK SQL CREDENCIAL'), 500, generica);
  verificar({ status: 404, message: 'DETALHE_INTERNO', expose: true }, 500, generica);
});
for (const code of ['23505', '42703', '42501', '42P08', 'ENOENT']) {
  test('erro técnico ' + code + ' não se torna erro público por statusCode', () => {
    verificar(Object.assign(new Error('SELECT senha FROM segredo; TOKEN_SIMULADO'), {
      code, statusCode: 404, detail: 'CREDENCIAL_SIMULADA', stack: 'STACK_INTERNA',
    }), 500, generica);
  });
}
for (const campo of ['query', 'sql', 'detail', 'severity']) {
  test('metadado técnico ' + campo + ' impede exposição', () => {
    verificar({ statusCode: 400, message: 'SQL_INTERNO', [campo]: 'SEGREDO' }, 500, generica);
  });
}
test('mensagem ausente ou vazia não é erro público reconhecido', () => {
  for (const message of [undefined, null, '', ' ', {}, 123]) {
    verificar({ statusCode: 404, message }, 500, generica);
  }
});
for (const [type, status, message] of [
  ['entity.parse.failed', 400, 'JSON invalido.'],
  ['entity.too.large', 413, 'Corpo da requisicao excede o limite.'],
]) {
  test('parser mantém mensagem fixa: ' + type, () => {
    verificar({ type, statusCode: 500, message: 'CORPO_COM_SEGREDOS', body: 'TOKEN' }, status, message);
  });
}
test('parser não reconhecido mantém comportamento 500 genérico', () => {
  verificar({ type: 'charset.unsupported', status: 415, message: 'INTERNO' }, 500, generica);
});
test('headersSent encaminha a falha sem segunda resposta', () => {
  const error = Object.assign(new Error('Ausente'), { statusCode: 404 });
  const { chamadas, encaminhados } = responder(error, true);
  assert.deepEqual(chamadas, []);
  assert.deepEqual(encaminhados, [error]);
});

async function requisitar(t, app, endpoint, options) {
  const server = app.listen(0, '127.0.0.1');
  t.after(() => new Promise((resolve, reject) => server.close(e => e ? reject(e) : resolve())));
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  const response = await fetch('http://127.0.0.1:' + server.address().port + endpoint, options);
  return { status: response.status, body: await response.json() };
}

for (const [modulo, metodo, mensagem] of [
  ['dadosTecnicos', 'buscarDadosTecnicosPorLocal', 'Dados técnicos não encontrados para este local.'],
  ['relatorio', 'buscarRelatorioPorLocal', 'Relatório não encontrado para este local.'],
]) {
  for (const estado of ['sem registro', 'externo', 'inexistente', 'falha SQL']) {
    test(modulo + ': serviço e controller reais pelo app real — ' + estado, async t => {
      const chamadas = [];
      const usuario = { id_usuario: 21, id_ambiente: '11111111-1111-4111-8111-111111111111' };
      const repository = {
        async buscarLocalAutorizadoNoAmbiente(id, identidade) {
          chamadas.push(['local', id, identidade]);
          if (estado === 'falha SQL') throw Object.assign(new Error('SELECT TOKEN_SENHA'), { code: '42703' });
          return estado === 'sem registro' ? { id_local: id } : null;
        },
        async buscarPorLocalNoAmbiente(id, identidade) { chamadas.push(['registro', id, identidade]); return null; },
      };
      const deps = { ['../repositories/' + modulo + 'MultiTenantRepository']: repository };
      if (modulo === 'relatorio') Object.assign(deps, {
        './pdfService': {}, '../utils/relatorioArquivoUtils': {}, '../utils/normalizarIdDominio': normalizarId,
      });
      const service = carregar('../src/services/' + modulo + 'MultiTenantService.js', deps);
      assert.equal(typeof service[metodo], 'function');
      const controller = carregar('../src/controllers/' + modulo + 'Controller.js', {
        ['../services/' + modulo + 'MultiTenantService']: service,
      });
      const router = express.Router();
      // Identidade sintética só nesta dependência simulada; middleware real não é alterado.
      router.get('/local/:idLocal', (req, _res, next) => { req.usuario = usuario; next(); }, controller.buscarPorLocal);
      const resultado = await requisitar(t, preparar(router).app, '/api/' +
        (modulo === 'relatorio' ? 'relatorios' : 'dados-tecnicos') + '/local/13');
      assert.deepEqual(resultado, {
        status: estado === 'falha SQL' ? 500 : 404,
        body: { status: 'error', message: estado === 'falha SQL' ? generica : estado === 'sem registro' ? mensagem : 'Local não encontrado.' },
      });
      assert.equal(chamadas.length, estado === 'sem registro' ? 2 : 1);
      assert.equal(chamadas[0][1], 13);
      assert.deepEqual(chamadas[0][2], usuario);
    });
  }
}
for (const [nome, corpo, status, message] of [
  ['JSON malformado', '{', 400, 'JSON invalido.'],
  ['limite real', JSON.stringify({ valor: 'x'.repeat(65536) }), 413, 'Corpo da requisicao excede o limite.'],
]) {
  test('pipeline Express: ' + nome, async t => {
    const resultado = await requisitar(t, preparar().app, '/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: corpo,
    });
    assert.deepEqual(resultado, { status, body: { status: 'error', message } });
  });
}
