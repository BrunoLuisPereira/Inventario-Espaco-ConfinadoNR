const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const politica = require('../src/utils/permissoes');
const normalizarId = require('../src/utils/normalizarIdDominio');
const A = '11111111-1111-4111-8111-111111111111', B = '22222222-2222-4222-8222-222222222222';
const identidade = { id_usuario: 1, id_ambiente: A, perfil_acesso: 'ADMINISTRADOR', eh_fundador: true };
function carregar(arquivo, deps) {
  const filename = path.resolve(__dirname, arquivo), module = { exports: {} };
  vm.runInThisContext('(function(require,module,exports){' + fs.readFileSync(filename, 'utf8') + '\n})', { filename })(nome => {
    assert.ok(Object.hasOwn(deps, nome), 'Dependência inesperada: ' + nome); return deps[nome];
  }, module, module.exports);
  return module.exports;
}
function preparar(n = 1001, opcoes = {}) {
  const ambiente = opcoes.ambiente || A;
  const eventos = [], liberacoes = [], autorizacoes = [];
  const usuario = { ...identidade }, abortar = new AbortController();
  const registros = Array.from({ length: n }, (_, i) => ({ id_auditoria: String(i + 1), id_ambiente: A, data_hora: '2026-10-20T00:00:00Z', nome_usuario: 'A' }));
  registros.push({ id_auditoria: '999999', id_ambiente: B, data_hora: '2026-10-20T00:00:00Z', nome_usuario: 'B' });
  if (opcoes.datasDiferentes) registros[0].data_hora = '2026-10-21T00:00:00Z';
  let snapshot, cursor = 0, fetches = 0;
  const c = {
    async query(sql, valores) {
      const q = sql.replace(/\s+/g, ' ').trim(); eventos.push(q);
      if (opcoes.falhar && q.startsWith(opcoes.falhar)) throw Error('SQL_SEGREDO');
      if (q === 'BEGIN ISOLATION LEVEL READ COMMITTED READ ONLY' || q.startsWith('SET LOCAL ') || ['COMMIT', 'ROLLBACK', 'CLOSE nr33_auditoria_exportacao'].includes(q)) return { rows: [] };
      if (q.startsWith('SELECT u.perfil_acesso')) {
        assert.deepEqual(valores, [1, ambiente]); assert.match(q, /u.id_usuario=\$1 AND u.id_ambiente=\$2 AND u.ativo AND a.ativo/);
        autorizacoes.push(1);
        return { rows: opcoes.inativo ? [] : [{ perfil_acesso: usuario.perfil_acesso, eh_fundador: usuario.eh_fundador }] };
      }
      if (q.startsWith('DECLARE nr33_auditoria_exportacao')) {
        assert.match(q, /INSENSITIVE NO SCROLL CURSOR WITHOUT HOLD/); assert.match(q, /WHERE h.id_ambiente=\$1 AND EXISTS/);
        assert.match(q, /u.id_usuario=\$2 AND u.id_ambiente=h.id_ambiente/); assert.match(q, /u.ativo AND a.ativo/);
        assert.match(q, /u.eh_fundador AND u.perfil_acesso='ADMINISTRADOR'/);
        assert.match(q, /afetado.id_ambiente=h.id_ambiente/); assert.match(q, /responsavel.id_ambiente=h.id_ambiente/);
        assert.match(q, /ORDER BY h.data_hora DESC,h.id_auditoria DESC$/); assert.deepEqual(valores, [ambiente, 1]);
        snapshot = registros.filter(r => r.id_ambiente === ambiente).sort((a, b) => b.data_hora.localeCompare(a.data_hora) || Number(b.id_auditoria) - Number(a.id_auditoria)).map(r => ({ ...r }));
        // Registro que confirma depois de aberto o cursor não pertence ao snapshot.
        registros.push({ id_auditoria: String(n + 1), id_ambiente: A });
        return { rows: [] };
      }
      if (q === 'FETCH FORWARD 500 FROM nr33_auditoria_exportacao') {
        fetches++;
        if (opcoes.revogar && fetches === 2) usuario.eh_fundador = false;
        if (opcoes.cancelar && fetches === 2) abortar.abort();
        const rows = snapshot.slice(cursor, cursor + 500); cursor += rows.length;
        return { rows };
      }
      throw Error('SQL não reconhecido');
    },
    release(erro) { liberacoes.push(erro); },
  };
  const repository = carregar('../src/repositories/auditoriaExportacaoRepository.js', {
    '../config/database': { async connect() { eventos.push('CONNECT'); return c; } },
    '../utils/normalizarIdDominio': normalizarId, '../utils/permissoes': politica,
  });
  const options = { signal: abortar.signal, validarSessao() { if (opcoes.expirado) throw Object.assign(Error('Expirado'), { statusCode: 401 }); } };
  return { repository, eventos, liberacoes, autorizacoes, options, usuario };
}
for (const n of [0, 1, 9, 200, 201, 1001, 5007]) test('cursor exporta ' + n + ' registros sem limite total, repetição ou omissão', async () => {
  const c = preparar(n), linhas = [];
  for await (const lote of c.repository.exportar(identidade, c.options)) { assert.ok(lote.length <= 500); linhas.push(...lote); }
  assert.equal(linhas.length, n); assert.ok(linhas.every(r => r.id_ambiente === A));
  assert.deepEqual(linhas.map(r => r.id_auditoria), Array.from({ length: n }, (_, i) => String(n - i)));
  assert.equal(new Set(linhas.map(r => r.id_auditoria)).size, n);
  assert.equal(c.eventos.at(-1), 'COMMIT'); assert.deepEqual(c.liberacoes, [undefined]);
});
test('ambiente B não recebe nenhum registro ou nome do ambiente A', async () => {
  const c = preparar(1001, { ambiente: B }), linhas = [];
  for await (const lote of c.repository.exportar({ ...identidade, id_ambiente: B }, c.options)) linhas.push(...lote);
  assert.deepEqual(linhas.map(l => l.nome_usuario), ['B']);
  assert.ok(linhas.every(l => l.id_ambiente === B));
});
test('data prevalece sobre o ID, com desempate estável', async () => {
  const c = preparar(9, { datasDiferentes: true }), linhas = [];
  for await (const lote of c.repository.exportar(identidade, c.options)) linhas.push(...lote);
  assert.deepEqual(linhas.map(l => l.id_auditoria), ['1', '9', '8', '7', '6', '5', '4', '3', '2']);
});
for (const falhar of ['FETCH', 'CLOSE', 'COMMIT']) test('falha ' + falhar + ' reverte e libera', async () => {
  const c = preparar(1001, { falhar });
  await assert.rejects(async () => { for await (const lote of c.repository.exportar(identidade, c.options)) assert.ok(lote); });
  assert.equal(c.eventos.at(-1), 'ROLLBACK'); assert.equal(c.liberacoes.length, 1);
});
for (const op of ['revogar', 'cancelar', 'inativo', 'expirado']) test('nega ' + op + ' e não confirma exportação', async () => {
  const c = preparar(1001, { [op]: true }), lotes = [];
  await assert.rejects(async () => { for await (const lote of c.repository.exportar(identidade, c.options)) lotes.push(lote); });
  assert.ok(lotes.length <= 1); assert.equal(c.eventos.includes('COMMIT'), false);
  if (op !== 'expirado') assert.equal(c.eventos.at(-1), 'ROLLBACK');
});
test('abandono do consumidor fecha transação e libera conexão', async () => {
  const c = preparar();
  for await (const lote of c.repository.exportar(identidade, c.options)) { assert.equal(lote.length, 500); break; }
  assert.equal(c.eventos.at(-1), 'ROLLBACK'); assert.equal(c.liberacoes.length, 1);
});
for (const perfil of politica.perfis.filter(p => p !== 'ADMINISTRADOR')) test('perfil ' + perfil + ' não abre conexão', async () => {
  const c = preparar();
  await assert.rejects(async () => { for await (const _ of c.repository.exportar({ ...identidade, perfil_acesso: perfil }, c.options)) assert.fail(); }, { statusCode: 403 });
  assert.deepEqual(c.eventos, []);
});

function resposta() {
  const res = new EventEmitter();
  Object.assign(res, { headersSent: false, destroyed: false, frames: [], headers: {}, statusCode: 200,
    setHeader(k, v) { this.headers[k] = v; }, status(n) { this.statusCode = n; return this; },
    json(body) { this.body = body; this.headersSent = true; },
    write(linha) { this.headersSent = true; this.frames.push(JSON.parse(linha)); return true; },
    end() { this.fim = true; }, destroy() { this.destroyed = true; this.emit('close'); },
  });
  return res;
}
for (const falhar of [false, true]) test('controller só confirma após iterador concluído; falha parcial não vira sucesso: ' + falhar, async () => {
  const controller = carregar('../src/controllers/auditoriaExportacaoController.js', {
    '../repositories/auditoriaExportacaoRepository': { async *exportar(_u, options) {
      options.validarSessao(); yield [{ id_auditoria: '1' }]; if (falhar) throw Error('SQL_SEGREDO');
    } }, jsonwebtoken: { verify() { return { sub: '1' }; } }, '../utils/normalizarIdDominio': normalizarId,
  });
  const req = Object.assign(new EventEmitter(), { usuario: identidade, headers: { authorization: 'Bearer FIXTURE' } });
  const res = resposta(); await controller.historicoCompleto(req, res);
  assert.equal(res.frames.some(f => f.tipo === 'fim'), !falhar);
  assert.equal(res.destroyed, falhar); assert.equal(req.listenerCount('aborted'), 0);
  assert.equal(JSON.stringify(res.frames).includes('SEGREDO'), false);
});
test('rollback com falha descarta conexão', async () => {
  const c = preparar(1001, { falhar: 'ROLLBACK', revogar: true });
  await assert.rejects(async () => { for await (const lote of c.repository.exportar(identidade, c.options)) assert.ok(lote); }, { statusCode: 403 });
  assert.deepEqual(c.liberacoes, [true]);
});

for (const condicao of ['semJWT', 'invalido', 'naoAdministrador', 'inativo', 'valido']) test('router real da exportação: ' + condicao, async t => {
  const anterior = process.env.JWT_SECRET; process.env.JWT_SECRET = 'SOMENTE_TESTE';
  t.after(() => { if (anterior === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = anterior; });
  const c = preparar(1001);
  const usuario = { ...identidade, perfil_acesso: condicao === 'naoAdministrador' ? 'VISUALIZADOR' : 'ADMINISTRADOR' };
  let consultas = 0;
  const jwt = { verify(token) { if (token === 'invalido') throw Object.assign(Error('JWT_INTERNO'), { name: 'JsonWebTokenError' }); return { sub: '1', perfil: 'ADMINISTRADOR' }; } };
  const auth = carregar('../src/middlewares/autenticacaoMiddleware.js', {
    jsonwebtoken: jwt, '../utils/permissoes': politica, '../utils/normalizarIdDominio': normalizarId,
    '../repositories/usuarioRepository': { async buscarIdentidadeAutenticada() { consultas++; return condicao === 'inativo' ? null : usuario; } },
  });
  const controller = carregar('../src/controllers/auditoriaExportacaoController.js', {
    '../repositories/auditoriaExportacaoRepository': c.repository, jsonwebtoken: jwt, '../utils/normalizarIdDominio': normalizarId,
  });
  const proibido = new Proxy({}, { get() { return () => { throw Error('Handler fora do escopo'); }; } });
  const router = carregar('../src/routes/usuarioRoutes.js', {
    express: require('express'), '../controllers/usuarioController': proibido, '../controllers/usuarioPermissoesController': proibido,
    '../controllers/auditoriaExportacaoController': controller, '../middlewares/autenticacaoMiddleware': auth,
    '../middlewares/autorizacaoMiddleware': require('../src/middlewares/autorizacaoMiddleware'), '../utils/permissoes': politica,
  });
  const req = Object.assign(new EventEmitter(), { method: 'GET', url: '/auditoria/perfis/exportar?id_ambiente=' + B,
    body: { id_ambiente: B }, headers: condicao === 'semJWT' ? {} : { authorization: 'Bearer ' + (condicao === 'invalido' ? 'invalido' : 'FIXTURE') } });
  const res = resposta();
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('Timeout do router')), 2000);
    const concluir = () => { clearTimeout(timer); resolve(); };
    const json = res.json; res.json = function (...args) { json.apply(this, args); concluir(); };
    const end = res.end; res.end = function () { end.call(this); concluir(); };
    router.handle(req, res, e => { clearTimeout(timer); reject(e || Error('Rota não montada')); });
  });
  assert.equal(res.statusCode, condicao === 'valido' ? 200 : condicao === 'naoAdministrador' ? 403 : 401);
  if (condicao === 'valido') {
    assert.equal(res.frames.at(-1).total, '1001');
    assert.ok(res.frames.filter(f => f.tipo === 'lote').flatMap(f => f.registros).every(r => r.id_ambiente === A));
    assert.equal(consultas, 1, 'Uma autenticação no router; revalidação da escrita usa o mesmo cliente SQL');
  } else assert.deepEqual(c.eventos, [], 'Negação impede abrir cursor');
});

for (const condicao of ['erroInicial', 'backpressure', 'desconexao']) test('transporte: ' + condicao, async () => {
  const c = preparar(1001, condicao === 'erroInicial' ? { falhar: 'DECLARE' } : {});
  const controller = carregar('../src/controllers/auditoriaExportacaoController.js', {
    '../repositories/auditoriaExportacaoRepository': c.repository, jsonwebtoken: { verify() { return { sub: '1' }; } }, '../utils/normalizarIdDominio': normalizarId,
  });
  const req = Object.assign(new EventEmitter(), { usuario: identidade, headers: { authorization: 'Bearer FIXTURE' } });
  const res = resposta(); const write = res.write;
  res.write = function (linha) {
    write.call(this, linha);
    if (condicao === 'desconexao') { this.destroy(); return true; }
    if (condicao === 'backpressure') { setImmediate(() => this.emit('drain')); return false; }
    return true;
  };
  await controller.historicoCompleto(req, res);
  if (condicao === 'erroInicial') { assert.equal(res.statusCode, 500); assert.equal(JSON.stringify(res.body).includes('SEGREDO'), false); }
  if (condicao === 'backpressure') assert.equal(res.frames.at(-1).total, '1001');
  if (condicao === 'desconexao') { assert.equal(c.eventos.at(-1), 'ROLLBACK'); assert.equal(res.frames.length, 1); }
  assert.equal(c.liberacoes.length, 1);
  assert.equal(res.listenerCount('drain'), 0);
});
