const politicaRbac723 = require('../src/utils/permissoes');
const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const crypto = require('node:crypto');
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';
const token = 'a'.repeat(64);
const hash = crypto.createHash('sha256').update(token).digest('hex');
const dados = { nome: 'Pessoa', email: ' NOVA@example.invalid ', senha: 'senha-simulada' };
const conviteDados = { email: ' NOVA@example.invalid ', perfilAcesso: 'ENGENHEIRO_SEGURANCA' };

test('RBAC: convite administrativo novo é recusado antes de conectar',async t=>{
  const c=preparar(t);
  await assert.rejects(c.convites.emitirConvite(10,{...conviteDados,perfilAcesso:'ADMINISTRADOR'}),{statusCode:400});
  assert.deepEqual(c.eventos,[]);
});
test('RBAC: convite administrativo histórico não é aceito nem cancelado automaticamente',async t=>{
  const c=preparar(t,{comConvite:true,convite:{perfil_acesso:'ADMINISTRADOR'}});
  const antes=structuredClone(c.estado.convites);
  await assert.rejects(c.convites.aceitarConvite(token,dados),{statusCode:409});
  assert.deepEqual(c.estado.convites,antes);assert.deepEqual(c.estado.usuarios,[]);
  assert.equal(c.eventos.some(e=>/^INSERT|^UPDATE/.test(e.sql||'')),false);
});

test('cadastro publico preserva nome da empresa e gera UUID pelo repositorio, sem aceitar ambiente forjado', async t => {
  const c=preparar(t);
  const r=await c.cadastro.cadastrarAmbiente({...dados,nome_ambiente:' Empresa sintetica A ',id_ambiente:A,perfil_acesso:'MASTER'});
  assert.equal(r.ambiente.nome,'Empresa sintetica A');
  assert.equal(r.ambiente.id_ambiente,B);
  assert.equal(r.usuario.perfil_acesso,'ADMINISTRADOR');
  const inserir=c.eventos.find(e=>e.sql?.startsWith('INSERT INTO usuario'));
  assert.match(inserir.sql,/perfil_acesso, eh_fundador/);
  assert.match(inserir.sql,/'ADMINISTRADOR', TRUE/);
});
for(const nome of ['', ' ', 'x'.repeat(181), null, {}]) test('cadastro recusa nome de ambiente invalido: '+String(nome),async t=>{
  const c=preparar(t);
  await assert.rejects(c.cadastro.cadastrarAmbiente({...dados,nome_ambiente:nome}),{statusCode:400});
  assert.deepEqual(c.eventos,[]);
});

for (const operacao of ['cadastro', 'aceitar']) for (const tamanho of [120, 121]) {
  test(`contrato DDL observado: ${operacao} nome com ${tamanho} caracteres`, async t => {
    const c = preparar(t, { comConvite: operacao === 'aceitar' });
    const entrada = { ...dados, nome: 'N'.repeat(tamanho) };
    const executar = () => operacao === 'cadastro' ? c.cadastro.cadastrarAmbiente(entrada) : c.convites.aceitarConvite(token, entrada);
    if (tamanho === 121) {
      await assert.rejects(executar(), { statusCode: 400 });
      assert.deepEqual(c.eventos, [], 'nome invalido deve ser rejeitado antes de conectar');
    } else {
      await executar();
      assert.equal(c.estado.usuarios[0].nome, entrada.nome);
      assert.ok(c.eventos.some(e => e.sql === 'COMMIT'));
    }
  });
}

function preparar(t, opcoes = {}) {
  const estado = { administrador: { id_usuario: 10, id_ambiente: A, eh_fundador: true, perfil_acesso: 'ADMINISTRADOR', ativo: true },
    ambienteAtivo: true, usuarios: [], ambientes: [], convites: [], ...opcoes.estado };
  const originalConvite = { id_convite: C, id_ambiente: A, email: 'nova@example.invalid',
    eh_fundador: false, perfil_acesso: 'ENGENHEIRO_SEGURANCA', token_hash: hash, data_aceite: null, data_cancelamento: null,
    nao_expirado: true, data_expiracao: 'data-simulada', ...opcoes.convite };
  if (opcoes.comConvite) estado.convites.push(originalConvite);
  const eventos = [], logs = [], desconhecidos = [], falhasSimulador = [];
  let trabalho, aberta = false, ambienteLock = false, usuarioLock = false, conviteLock = false, emailLock;
  const clone = value => JSON.parse(JSON.stringify(value));
  const rows = (...valores) => ({ rows: valores });
  const publico = u => { const { senha_hash, ...resto } = u; return resto; };
  async function query(sql, parametros = []) {
    const texto = sql.replace(/\s+/g, ' ').trim();
    eventos.push({ sql: texto, parametros });
    if (opcoes.falhar?.(texto)) throw opcoes.erro || new Error('SQL SENHA TOKEN /interno');
    if (texto === 'BEGIN') { aberta = true; ambienteLock = usuarioLock = conviteLock = false; trabalho = clone(estado); return rows(); }
    if (texto === 'ROLLBACK') { aberta = false; trabalho = undefined; return rows(); }
    if (texto === 'COMMIT') { assert.ok(aberta); Object.assign(estado, trabalho); aberta = false; return rows(); }
    assert.ok(aberta, 'SQL deve usar a transação');
    if (texto.includes('pg_advisory_xact_lock')) {
      assert.equal(ambienteLock || usuarioLock || conviteLock, false); emailLock = parametros[0];
      if (opcoes.aoEmailLock) opcoes.aoEmailLock(estado);
      trabalho = clone(estado); return rows();
    }
    if (texto.startsWith('SELECT EXISTS')) {
      assert.equal(parametros[0], emailLock);
      assert.match(texto, /LOWER\(BTRIM\(email\)\) = LOWER\(BTRIM\(\$1\)\)/);
      if (texto.includes('FROM usuario')) return rows({ existe: trabalho.usuarios.some(u => u.email.trim().toLowerCase() === emailLock) });
      if (texto.includes('FROM convite')) {
        assert.match(texto, /data_aceite IS NULL/); assert.match(texto, /data_cancelamento IS NULL/);
        assert.match(texto, /data_expiracao > clock_timestamp\(\)/);
        return rows({ existe: trabalho.convites.some(c => c.email === emailLock && c.data_aceite === null && c.data_cancelamento === null && c.nao_expirado) });
      }
    }
    if (texto.startsWith('SELECT') && texto.includes('FROM usuario AS u')) {
      assert.deepEqual(parametros.slice(0, 1), [10]);
      assert.match(texto, /u.id_usuario = \$1/);
      assert.match(texto, /u.ativo = TRUE/); assert.match(texto, /u.perfil_acesso = 'ADMINISTRADOR'/);
      if (texto.includes('FOR SHARE') || texto.includes('FOR UPDATE')) {
        assert.match(texto, /u.id_ambiente = \$2/);
        assert.ok(ambienteLock); usuarioLock = true;
        if (opcoes.antesUsuarioLock) opcoes.antesUsuarioLock(estado);
        trabalho.administrador = clone(estado.administrador);
      }
      const u = trabalho.administrador;
      return u.ativo && u.perfil_acesso === 'ADMINISTRADOR' && trabalho.ambienteAtivo &&
        (parametros.length === 1 || parametros[1] === u.id_ambiente) ? rows({ ...u }) : rows();
    }
    if (texto.startsWith('SELECT') && texto.includes('FROM ambiente')) {
      assert.match(texto, /FOR SHARE/);
      assert.match(texto, /id_ambiente = \$1 AND ativo = TRUE/);
      assert.equal(parametros[0], estado.administrador.id_ambiente);
      if (opcoes.antesAmbienteLock) opcoes.antesAmbienteLock(estado);
      trabalho.ambienteAtivo = estado.ambienteAtivo;
      ambienteLock = true;
      return trabalho.ambienteAtivo ? rows({ id_ambiente: parametros[0], ativo: true }) : rows();
    }
    if (texto.startsWith('SELECT') && texto.includes('FROM convite')) {
      assert.deepEqual(parametros, [hash]);
      if (texto.includes('FOR UPDATE')) {
        assert.ok(ambienteLock, 'ambiente deve ser bloqueado antes do convite');
        conviteLock = true;
        if (opcoes.antesConviteLock) opcoes.antesConviteLock(estado);
        trabalho.convites = clone(estado.convites);
      }
      const c = trabalho.convites.find(c => c.token_hash === hash);
      if (!c) return rows();
      return texto.startsWith('SELECT email') ? rows({ email: c.email }) : rows({ ...c, ambiente_ativo: trabalho.ambienteAtivo });
    }
    if (texto.startsWith('INSERT INTO ambiente')) {
      assert.equal(emailLock, 'nova@example.invalid');
      assert.ok(parametros[0].length <= 180);
      const ambiente = { id_ambiente: B, nome: parametros[0], ativo: true };
      trabalho.ambientes.push(ambiente); return rows(ambiente);
    }
    if (texto.startsWith('INSERT INTO usuario')) {
      assert.equal(emailLock, parametros[2]);
      if (opcoes.insertVazio === 'usuario') return rows();
      const usuario = { id_usuario: 20, id_ambiente: parametros[0], nome: parametros[1], email: parametros[2],
        senha_hash: parametros[3], perfil_acesso: parametros[4] || 'ADMINISTRADOR', ativo: true };
      if (trabalho.usuarios.some(u => u.email === usuario.email)) throw Object.assign(new Error('duplicado'), { code: '23505' });
      trabalho.usuarios.push(usuario); return rows(publico(usuario));
    }
    if (texto.startsWith('INSERT INTO convite')) {
      assert.equal(parametros[0], trabalho.administrador.id_ambiente);
      assert.equal(parametros[1], emailLock);
      if (opcoes.insertVazio === 'convite') return rows();
      if (opcoes.revogarAoInsert && !usuarioLock) trabalho.administrador.perfil_acesso = 'ENGENHEIRO_SEGURANCA';
      const convite = { id_convite: C, id_ambiente: parametros[0], email: parametros[1], perfil_acesso: parametros[2],
        token_hash: parametros[3], id_usuario_convite: parametros[4], data_expiracao: parametros[5],
        data_aceite: null, data_cancelamento: null, nao_expirado: true };
      trabalho.convites.push(convite);
      const { token_hash, ...retorno } = convite; return rows(retorno);
    }
    if (texto.startsWith('UPDATE convite')) {
      assert.ok(conviteLock && ambienteLock); assert.deepEqual(parametros, [C]);
      const c = trabalho.convites.find(c => c.id_convite === C);
      if (opcoes.expirarAoAceitar || !c.nao_expirado || c.data_aceite !== null) return rows();
      c.data_aceite = 'aceite-simulado'; return rows({ ...c });
    }
    desconhecidos.push(texto); throw new Error('SQL desconhecido: ' + texto);
  }
  const client = { query: async (...args) => { try { return await query(...args); } catch (e) { if (e.code === 'ERR_ASSERTION') falhasSimulador.push(e); throw e; } },
    release: (...args) => eventos.push({ release: args }) };
  const pool = { connect: async () => { eventos.push({ connect: true }); if (opcoes.falhaConnect) throw new Error('SQL SENHA TOKEN'); return client; }, query: () => { desconhecidos.push('pool.query'); throw new Error('SQL fora da transação'); } };
  const nomes = ['services/cadastroService', 'services/conviteService', 'repositories/ambienteRepository',
    'repositories/cadastroRepository', 'repositories/conviteRepository', 'repositories/emailLockRepository',
    'repositories/usuarioConvidadoRepository', 'repositories/administradorRepository', 'controllers/cadastroController', 'controllers/conviteController'];
  const caminhos = nomes.map(p => require.resolve('../src/' + p));
  const anteriores = caminhos.map(p => [p, require.cache[p]]);
  const load = Module._load;
  let cadastro, convites, cadastroController, conviteController;
  t.mock.method(console, 'error', (...args) => logs.push(args));
  try {
    for (const p of caminhos) delete require.cache[p];
    Module._load = function (request, parent, ...args) {
      // Politica RBAC pura; demais imports desconhecidos continuam proibidos.
      if (request === '../utils/permissoes') return politicaRbac723;
      if (caminhos.includes(parent?.filename)) {
        if (request === '../config/database') return pool;
        if (request === 'bcryptjs') return { hash: async (senha, rounds) => { assert.equal(rounds, 12); return 'hash-simulado'; } };
        if (request === 'crypto' || request.startsWith('../repositories/') || request.startsWith('../services/')) return load.call(this, request, parent, ...args);
        desconhecidos.push(request); throw new Error('Import proibido: ' + request);
      }
      return load.call(this, request, parent, ...args);
    };
    cadastro = require(caminhos[0]); convites = require(caminhos[1]);
    cadastroController = require(caminhos[8]); conviteController = require(caminhos[9]);
  } finally {
    Module._load = load;
    for (const [p, anterior] of anteriores) { if (anterior) require.cache[p] = anterior; else delete require.cache[p]; }
  }
  t.after(() => { assert.deepEqual(desconhecidos, []); if (falhasSimulador.length) throw falhasSimulador[0]; });
  const res = { headersSent: false, envios: 0, status(code) { assert.equal(this.headersSent, false); this.statusCode = code; return this; },
    json(body) { assert.equal(this.headersSent, false); this.body = body; this.envios++; this.headersSent = true; return this; } };
  return { estado, eventos, logs, cadastro, convites, cadastroController, conviteController, res,
    locks: () => ({ ambienteLock, usuarioLock, conviteLock }),
    executar: operacao => operacao === 'cadastro' ? cadastro.cadastrarAmbiente(dados) :
      operacao === 'emitir' ? convites.emitirConvite(10, conviteDados) : convites.aceitarConvite(token, dados) };
}

test('emissão mantém administrador e ambiente bloqueados até INSERT', async t => {
  const c = preparar(t, { revogarAoInsert: true });
  await c.executar('emitir');
  assert.deepEqual(c.locks(), { ambienteLock: true, usuarioLock: true, conviteLock: false });
  assert.equal(c.estado.administrador.perfil_acesso, 'ADMINISTRADOR');
});
for (const operacao of ['cadastro', 'emitir', 'aceitar']) {
  test('rollback falho descarta conexão e não registra segredo: ' + operacao, async t => {
    const c = preparar(t, { comConvite: operacao === 'aceitar', falhar: sql => sql.startsWith('INSERT') || sql === 'ROLLBACK' });
    await assert.rejects(c.executar(operacao));
    assert.deepEqual(c.eventos.at(-1), { release: [true] });
    assert.equal(JSON.stringify(c.logs).includes('SQL SENHA TOKEN'), false);
  });
}

for (const operacao of ['cadastro', 'emitir', 'aceitar']) {
  test('INSERT sem resultado não confirma transação: ' + operacao, async t => {
    const c = preparar(t, { comConvite: operacao === 'aceitar', insertVazio: operacao === 'emitir' ? 'convite' : 'usuario' });
    const antes = JSON.stringify(c.estado);
    await assert.rejects(c.executar(operacao));
    assert.equal(JSON.stringify(c.estado), antes);
    assert.equal(c.eventos.some(e => e.sql === 'COMMIT'), false);
    assert.equal(c.eventos.at(-2).sql, 'ROLLBACK');
  });
}

const comandos = c => c.eventos.filter(e => ['BEGIN', 'COMMIT', 'ROLLBACK'].includes(e.sql)).map(e => e.sql);
const escritas = c => c.eventos.filter(e => /^(INSERT|UPDATE)/.test(e.sql || ''));
test('cadastro cria ambiente e primeiro administrador atomicamente, ignorando identidade forjada', async t => {
  const c = preparar(t);
  const resultado = await c.cadastro.cadastrarAmbiente({ ...dados, id_ambiente: A, perfil_acesso: 'GLOBAL', perfilAcesso: 'ENGENHEIRO_SEGURANCA', id_usuario: 10 });
  assert.equal(resultado.ambiente.id_ambiente, B); assert.equal(resultado.usuario.id_ambiente, B);
  assert.equal(resultado.usuario.perfil_acesso, 'ADMINISTRADOR'); assert.equal(resultado.usuario.senha_hash, undefined);
  assert.equal(c.estado.usuarios.length, 1); assert.equal(c.estado.ambientes.length, 1);
  assert.deepEqual(comandos(c), ['BEGIN', 'COMMIT']); assert.deepEqual(c.eventos.at(-1), { release: [] });
  const insert = escritas(c)[1]; assert.equal(insert.parametros[2], 'nova@example.invalid'); assert.equal(insert.parametros[3], 'hash-simulado');
  assert.match(insert.sql, /'ADMINISTRADOR'/);
});
test('nome legítimo no limite não causa falha do nome derivado do ambiente', async t => {
  const c = preparar(t); const nome = 'n'.repeat(120);
  const resultado = await c.cadastro.cadastrarAmbiente({ ...dados, nome });
  assert.equal(resultado.usuario.nome, nome); assert.equal(resultado.ambiente.nome, 'Ambiente de ' + nome);
});
for (const tipo of ['usuario', 'convite', 'usuarioConcorrente', 'conviteConcorrente']) {
  test('cadastro bloqueia e-mail indisponível sem criar ambiente: ' + tipo, async t => {
    const usuario = { email: 'nova@example.invalid', id_ambiente: A };
    const configuracao = tipo === 'usuario' ? { estado: { usuarios: [usuario] } } :
      tipo === 'convite' ? { comConvite: true } : { aoEmailLock: estado => {
        if (tipo === 'usuarioConcorrente') estado.usuarios.push(usuario);
        else estado.convites.push({ email: 'nova@example.invalid', data_aceite: null, data_cancelamento: null, nao_expirado: true });
      } };
    const c = preparar(t, configuracao);
    await assert.rejects(c.executar('cadastro'), { statusCode: 409 });
    assert.equal(escritas(c).length, 0); assert.equal(c.estado.ambientes.length, 0);
    assert.deepEqual(comandos(c), ['BEGIN', 'ROLLBACK']);
  });
}
for (const idAmbiente of [A, B]) for (const papel of ['ENGENHEIRO_SEGURANCA', 'TECNICO_SEGURANCA', 'COORDENADOR', 'SUPERVISOR', 'AUDITOR', 'VISUALIZADOR']) {
  test(`emissão legítima em ${idAmbiente} para ${papel} ignora ambiente do corpo`, async t => {
    const c = preparar(t, { estado: { administrador: { id_usuario: 10, id_ambiente: idAmbiente, eh_fundador: true, perfil_acesso: 'ADMINISTRADOR', ativo: true } } });
    const resultado = await c.convites.emitirConvite(10, { ...conviteDados, perfilAcesso: papel, id_ambiente: idAmbiente === A ? B : A, id_usuario: 999 });
    assert.equal(resultado.convite.id_ambiente, idAmbiente); assert.equal(resultado.convite.perfil_acesso, papel);
    assert.equal(resultado.convite.id_usuario_convite, 10); assert.match(resultado.token, /^[a-f0-9]{64}$/);
    assert.equal(resultado.convite.token_hash, undefined);
    assert.equal(c.estado.convites[0].token_hash, crypto.createHash('sha256').update(resultado.token).digest('hex'));
    assert.equal(JSON.stringify(c.eventos).includes(resultado.token), false);
    assert.equal(JSON.stringify(c.logs).includes(resultado.token), false);
    assert.deepEqual(comandos(c), ['BEGIN', 'COMMIT']);
    const env = c.eventos.findIndex(e => /FROM ambiente/.test(e.sql || ''));
    const admin = c.eventos.findIndex(e => /FOR SHARE OF u/.test(e.sql || ''));
    const insert = c.eventos.findIndex(e => /^INSERT INTO convite/.test(e.sql || ''));
    assert.ok(env > 0 && admin > env && insert > admin);
  });
}
for (const tipo of ['engenheiro', 'inativo', 'ambienteInativo', 'revogado', 'revogadoUsuario', 'revogadoAmbiente']) {
  test('emissão recusada sem INSERT: ' + tipo, async t => {
    const c = preparar(t, {
      ...(tipo === 'engenheiro' ? { estado: { administrador: { id_usuario: 10, id_ambiente: A, eh_fundador: false, perfil_acesso: 'ENGENHEIRO_SEGURANCA', ativo: true } } } : {}),
      ...(tipo === 'inativo' ? { estado: { administrador: { id_usuario: 10, id_ambiente: A, eh_fundador: true, perfil_acesso: 'ADMINISTRADOR', ativo: false } } } : {}),
      ...(tipo === 'ambienteInativo' ? { estado: { ambienteAtivo: false } } : {}),
      ...(tipo === 'revogado' ? { antesUsuarioLock: s => { s.administrador.perfil_acesso = 'ENGENHEIRO_SEGURANCA'; } } : {}),
      ...(tipo === 'revogadoUsuario' ? { antesUsuarioLock: s => { s.administrador.ativo = false; } } : {}),
      ...(tipo === 'revogadoAmbiente' ? { antesAmbienteLock: s => { s.ambienteAtivo = false; } } : {}),
    });
    await assert.rejects(c.convites.emitirConvite(10, { ...conviteDados, eh_fundador: true, perfil_acesso: 'ADMINISTRADOR', id_ambiente: B }), { statusCode: 403 });
    assert.equal(escritas(c).length, 0); assert.deepEqual(comandos(c), ['BEGIN', 'ROLLBACK']);
  });
}
for (const id of [undefined, 0, -1, '10', Number.MAX_SAFE_INTEGER + 1]) {
  test('identidade de emissão inválida: ' + id, async t => {
    const c = preparar(t); await assert.rejects(c.convites.emitirConvite(id, conviteDados), { statusCode: 401 });
    assert.equal(c.eventos.length, 0);
  });
}
for (const tipo of ['usuario', 'reserva']) {
  test('emissão respeita e-mail global: ' + tipo, async t => {
    const c = preparar(t, tipo === 'usuario' ? { estado: { usuarios: [{ email: 'nova@example.invalid', id_ambiente: B }] } } : { comConvite: true });
    await assert.rejects(c.executar('emitir'), { statusCode: 409 }); assert.equal(escritas(c).length, 0);
  });
}
test('aceite deriva usuário, ambiente e perfil somente do convite', async t => {
  const c = preparar(t, { comConvite: true });
  const resultado = await c.convites.aceitarConvite(token, { ...dados, id_ambiente: B, perfilAcesso: 'ADMINISTRADOR', eh_fundador: true, perfil_acesso: 'ADMINISTRADOR', email: 'forjado@example.invalid' });
  assert.equal(resultado.usuario.id_ambiente, A); assert.equal(resultado.usuario.perfil_acesso, 'ENGENHEIRO_SEGURANCA');
  assert.equal(resultado.usuario.email, 'nova@example.invalid'); assert.equal(resultado.usuario.senha_hash, undefined);
  assert.equal(resultado.convite.data_aceite, 'aceite-simulado'); assert.deepEqual(comandos(c), ['BEGIN', 'COMMIT']);
  const lockEnv = c.eventos.findIndex(e => /FROM ambiente/.test(e.sql || ''));
  const lockConvite = c.eventos.findIndex(e => /FOR UPDATE OF c/.test(e.sql || ''));
  assert.ok(lockEnv > 0 && lockConvite > lockEnv);
  assert.equal(JSON.stringify(c.eventos).includes(token), false);
});
test('aceite legítimo em B ignora ambiente A do cliente', async t => {
  const c = preparar(t, { comConvite: true, convite: { id_ambiente: B },
    estado: { administrador: { id_usuario: 10, id_ambiente: B, eh_fundador: true, perfil_acesso: 'ADMINISTRADOR', ativo: true } } });
  const resultado = await c.convites.aceitarConvite(token, { ...dados, id_ambiente: A });
  assert.equal(resultado.usuario.id_ambiente, B); assert.equal(c.estado.usuarios[0].id_ambiente, B);
});
for (const [convite, status] of [[{ nao_expirado: false }, 410], [{ data_cancelamento: 'cancelado' }, 409], [{ data_aceite: 'utilizado' }, 409]]) {
  test('aceite rejeita estado inválido: ' + JSON.stringify(convite), async t => {
    const c = preparar(t, { comConvite: true, convite });
    await assert.rejects(c.executar('aceitar'), { statusCode: status }); assert.equal(escritas(c).length, 0);
  });
}
for (const valor of [undefined, null, '', 'token', 'b'.repeat(63), 'B'.repeat(64)]) {
  test('token malformado não consulta banco: ' + String(valor), async t => {
    const c = preparar(t); await assert.rejects(c.convites.aceitarConvite(valor, dados), { statusCode: 400 });
    assert.equal(c.eventos.length, 0);
  });
}
test('token desconhecido retorna 404 sem escrita', async t => {
  const c = preparar(t); await assert.rejects(c.executar('aceitar'), { statusCode: 404 }); assert.equal(escritas(c).length, 0);
});
test('aceite não transfere conta já existente em outro ambiente', async t => {
  const c = preparar(t, { comConvite: true, estado: { usuarios: [{ email: 'nova@example.invalid', id_ambiente: B }] } });
  await assert.rejects(c.executar('aceitar'), { statusCode: 409 });
  assert.equal(escritas(c).length, 0); assert.equal(c.estado.usuarios[0].id_ambiente, B);
});
for (const tipo of ['cancelamento', 'expiracao', 'aceite', 'ambiente', 'email']) {
  test('aceite revalida estado após aguardar locks: ' + tipo, async t => {
    const c = preparar(t, { comConvite: true, antesConviteLock: s => {
      const convite = s.convites[0];
      if (tipo === 'cancelamento') convite.data_cancelamento = 'cancelado';
      if (tipo === 'expiracao') convite.nao_expirado = false;
      if (tipo === 'aceite') convite.data_aceite = 'outra-transacao';
      if (tipo === 'ambiente') convite.id_ambiente = B;
      if (tipo === 'email') convite.email = 'trocado@example.invalid';
    } });
    await assert.rejects(c.executar('aceitar'), { statusCode: tipo === 'expiracao' ? 410 : 409 });
    assert.equal(escritas(c).length, 0); assert.equal(c.estado.usuarios.length, 0);
  });
}
test('ambiente desativado antes de seu bloqueio impede aceite', async t => {
  const c = preparar(t, { comConvite: true, antesAmbienteLock: s => { s.ambienteAtivo = false; } });
  await assert.rejects(c.executar('aceitar'), { statusCode: 403 }); assert.equal(escritas(c).length, 0);
});
test('segundo aceite observa aplicação anterior e não cria outro usuário', async t => {
  const c = preparar(t, { comConvite: true }); await c.executar('aceitar');
  const quantidade = escritas(c).length;
  await assert.rejects(c.executar('aceitar'), { statusCode: 409 });
  assert.equal(c.estado.usuarios.length, 1); assert.equal(escritas(c).length, quantidade);
});
test('expiração na marcação de aceite reverte criação do usuário', async t => {
  const c = preparar(t, { comConvite: true, expirarAoAceitar: true });
  await assert.rejects(c.executar('aceitar'), { statusCode: 409 });
  assert.equal(c.estado.usuarios.length, 0); assert.equal(c.estado.convites[0].data_aceite, null);
});
for (const operacao of ['cadastro', 'emitir', 'aceitar']) {
  for (const etapa of ['BEGIN', 'INSERT', 'COMMIT']) {
    test(`falha ${etapa} reverte e libera: ${operacao}`, async t => {
      const erro = new Error('SQL SENHA TOKEN /interno');
      const c = preparar(t, { comConvite: operacao === 'aceitar', erro, falhar: sql => sql.startsWith(etapa) });
      const antes = JSON.stringify(c.estado);
      await assert.rejects(c.executar(operacao), e => e === erro);
      assert.equal(JSON.stringify(c.estado), antes);
      assert.deepEqual(c.eventos.at(-1), { release: etapa === 'BEGIN' || etapa === 'COMMIT' ? [true] : [] });
      if (etapa !== 'BEGIN') assert.equal(comandos(c).at(-1), 'ROLLBACK');
      assert.equal(JSON.stringify(c.logs).includes('SQL SENHA TOKEN'), false);
    });
  }
  test('falha de conexão não tenta liberar conexão inexistente: ' + operacao, async t => {
    const c = preparar(t, { comConvite: operacao === 'aceitar', falhaConnect: true });
    await assert.rejects(c.executar(operacao)); assert.equal(c.eventos.some(e => e.release), false);
  });
  test('contrato HTTP seguro em falha técnica: ' + operacao, async t => {
    const c = preparar(t, { comConvite: operacao === 'aceitar', falhar: sql => sql.startsWith('INSERT') });
    const req = { body: operacao === 'emitir' ? conviteDados : { ...dados, token }, usuario: { id_usuario: 10 } };
    if (operacao === 'cadastro') await c.cadastroController.cadastrarAmbiente(req, c.res);
    else await c.conviteController[operacao === 'emitir' ? 'emitir' : 'aceitar'](req, c.res);
    assert.equal(c.res.statusCode, 500); assert.equal(c.res.envios, 1); assert.equal(c.res.body.status, 'error');
    assert.equal(JSON.stringify([c.res.body, c.logs]).includes('SQL SENHA TOKEN'), false);
  });
  test('contrato HTTP 201 preservado: ' + operacao, async t => {
    const c = preparar(t, { comConvite: operacao === 'aceitar' });
    const req = { body: operacao === 'emitir' ? conviteDados : { ...dados, token }, usuario: { id_usuario: 10 } };
    if (operacao === 'cadastro') await c.cadastroController.cadastrarAmbiente(req, c.res);
    else await c.conviteController[operacao === 'emitir' ? 'emitir' : 'aceitar'](req, c.res);
    assert.equal(c.res.statusCode, 201); assert.equal(c.res.envios, 1); assert.equal(c.res.body.status, 'success');
    assert.equal(c.res.body.message, operacao === 'cadastro' ? 'Ambiente e administrador cadastrados com sucesso.' :
      operacao === 'emitir' ? 'Convite criado com sucesso.' : 'Convite aceito com sucesso.');
    assert.deepEqual(Object.keys(c.res.body).sort(), ['data', 'message', 'status']);
  });
}

test('falha no administrador reverte ambiente já inserido', async t => {
  const erro = new Error('SQL SENHA TOKEN');
  const c = preparar(t, { erro, falhar: sql => sql.startsWith('INSERT INTO usuario') });
  await assert.rejects(c.executar('cadastro'), e => e === erro);
  assert.ok(c.eventos.some(e => e.sql?.startsWith('INSERT INTO ambiente')));
  assert.equal(c.estado.ambientes.length, 0); assert.equal(c.estado.usuarios.length, 0);
  assert.deepEqual(comandos(c), ['BEGIN', 'ROLLBACK']);
});
test('falha técnica ao marcar aceite reverte usuário já inserido', async t => {
  const erro = new Error('SQL SENHA TOKEN');
  const c = preparar(t, { comConvite: true, erro, falhar: sql => sql.startsWith('UPDATE convite') });
  await assert.rejects(c.executar('aceitar'), e => e === erro);
  assert.ok(c.eventos.some(e => e.sql?.startsWith('INSERT INTO usuario')));
  assert.equal(c.estado.usuarios.length, 0); assert.equal(c.estado.convites[0].data_aceite, null);
  assert.deepEqual(comandos(c), ['BEGIN', 'ROLLBACK']);
});
