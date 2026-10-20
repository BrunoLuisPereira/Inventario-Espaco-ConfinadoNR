const politicaRbac723 = require('../src/utils/permissoes');
const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const express = require('express');
const routerPath = require.resolve('../src/routes/sincronizacaoRoutes');
const authPath = require.resolve('../src/middlewares/autenticacaoMiddleware');
const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const rotas = [['POST','/','criar'], ['GET','/','listar'], ['GET','/pendentes','buscarPendentes'], ['GET','/conflitos','buscarConflitos'],
  ['GET','/entidade/LOCAL/10','buscarPorEntidade'], ['PATCH','/1/resolver','resolverConflito'], ['POST','/1/processar','processarSincronizacao'],
  ['PATCH','/1/status','atualizarStatus'], ['GET','/1','buscarPorId'], ['DELETE','/1','excluir']];
function preparar(t) {
  let chamadas = 0, consultas = 0; const estado = { ativo: true, ambienteAtivo: true, perfil: 'ENGENHEIRO_SEGURANCA' };
  const cache = new Map([routerPath, authPath].map(p => [p, require.cache[p]])); const load = Module._load;
  const segredo = process.env.JWT_SECRET; process.env.JWT_SECRET = 'SIMULADO_SINCRONIZACAO';
  let router;
  try {
    for (const p of cache.keys()) delete require.cache[p];
    Module._load = function (r, parent, ...args) {
      // Politica RBAC pura; demais imports desconhecidos continuam proibidos.
      if (r === '../utils/permissoes') return politicaRbac723;
      // Utilitario puro real, restrito aos tres consumidores autorizados.
      if (r === '../utils/normalizarIdDominio' && ['middlewares/autenticacaoMiddleware', 'services/authService', 'services/relatorioMultiTenantService'].some(p => parent?.filename === require.resolve('../src/' + p))) return require('../src/utils/normalizarIdDominio');
      if (parent?.filename === authPath) {
        if (r === 'jsonwebtoken') return { verify(token) { if (token !== 'valido') throw Object.assign(new Error('TOKEN_PRIVADO'), { name: token === 'expirado' ? 'TokenExpiredError' : 'JsonWebTokenError' }); return { sub: '11', perfil: 'ADMINISTRADOR', id_ambiente: 'FORJADO_JWT' }; } };
        if (r === '../repositories/usuarioRepository') return { async buscarIdentidadeAutenticada() { consultas++; return estado.ativo && estado.ambienteAtivo ? { id_usuario: 11, id_ambiente: A, perfil_acesso: estado.perfil } : null; } };
        throw new Error('Dependência proibida: ' + r);
      }
      if (parent?.filename === routerPath) {
        if (r === 'express') return express;
        if (r === '../middlewares/autenticacaoMiddleware') return require(authPath);
        if (r === '../controllers/sincronizacaoController') return Object.fromEntries(rotas.map(([, , nome]) => [nome, (req, res) => { chamadas++; return res.status(200).json({ status: 'success', data: req.usuario, handler: nome, params: { ...req.params } }); }]));
        throw new Error('Dependência proibida: ' + r);
      }
      return load.call(this, r, parent, ...args);
    };
    router = require(routerPath);
  } finally {
    Module._load = load; for (const [p,v] of cache) { if (v) require.cache[p] = v; else delete require.cache[p]; }
  }
  t.after(() => { if (segredo === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = segredo; });
  async function requisitar(method, url, token = 'valido') {
    let resolver; const fim = new Promise(r => { resolver = r; }); let envios = 0;
    const req = { method, url, headers: token == null ? {} : { authorization: 'Bearer ' + token },
      body: { id_usuario: 99, id_ambiente: 'FORJADO_CORPO', eh_fundador: true, perfil_acesso: 'ADMINISTRADOR' }, query: { id_ambiente: 'FORJADO_QUERY' } };
    const res = { statusCode: 200, headersSent: false, status(c) { this.statusCode = c; return this; }, json(d) { envios++; this.body = d; this.headersSent = true; resolver(); return this; } };
    router.handle(req, res, e => { res.status(e?.statusCode || 500).json({ status: 'error', message: 'Erro simulado.' }); });
    await fim; assert.equal(envios, 1); return res;
  }
  return { estado, requisitar, chamadas: () => chamadas, consultas: () => consultas };
}
for (const [method,url,nome] of rotas) {
  test(nome + ': identidade atual do banco e handler correto', async t => {
    const s = preparar(t), res = await s.requisitar(method,url);
    assert.equal(res.statusCode,200); assert.deepEqual(res.body.data, { id_usuario: 11, id_ambiente: A, eh_fundador: false, perfil_acesso: 'ENGENHEIRO_SEGURANCA' });
    assert.equal(res.body.handler,nome); assert.equal(s.consultas(),1); assert.equal(s.chamadas(),1);
  });
  test(nome + ': inatividade impede chamada ao controller', async t => {
    const s = preparar(t); s.estado.ambienteAtivo = false;
    const res = await s.requisitar(method,url); assert.equal(res.statusCode,401); assert.equal(s.chamadas(),0); assert.equal(s.consultas(),1);
  });
}
for (const token of [null, 'invalido', 'expirado', 'adulterado']) test('JWT rejeitado ' + token, async t => {
  const s = preparar(t), res = await s.requisitar('GET','/',token);
  assert.equal(res.statusCode,401); assert.equal(s.chamadas(),0); assert.equal(s.consultas(),0); assert.doesNotMatch(JSON.stringify(res.body), /TOKEN_PRIVADO/);
});
