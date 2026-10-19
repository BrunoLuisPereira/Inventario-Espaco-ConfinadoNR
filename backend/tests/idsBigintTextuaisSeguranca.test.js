const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { preparar, A, B, UUID, PDF } = require('./helpers/idsBigintSimulados.cjs');

// Regressões desejadas: falhas de sucesso devem permanecer visíveis até a
// normalização autorizada. Não há skip/todo nem mudança no parser do driver.
// As respostas/snapshots preservam os campos devolvidos, sem impor neste passo
// uma nova política pública de converter todos os IDs para número ou string.
// Diagnóstico inicial em 00a48b5: login misto/textual e identidade textual
// falham; a identidade afeta conta, administração, convites e Excel. PDFs
// falham com IDs textuais vindos do registro. Isolamento individual com ator
// textual recebe 401 antes da consulta, em vez do 404 esperado; não é vazamento.
// Controles numéricos, snapshots, UUIDs/NULL e limites já protegidos passam.
const perfil = { nome: 'Nome atualizado' };
const senha = { senhaAtual: 'antiga123', novaSenha: 'novaSenha123', confirmarSenha: 'novaSenha123' };
const escritaAdmin = { nome: 'Administrador atualizado', email: 'atualizado@example.invalid', eh_fundador: true, perfil_acesso: 'ADMINISTRADOR' };

for (const ids of [[10, 10], ['10', '10'], [10, '10'], ['10', 10]]) {
  test(`[login] leituras ${JSON.stringify(ids)} representam a mesma conta`, async t => {
    const c = preparar(t, { loginIds: ids }); const res = c.resposta();
    await c.authController.login({ body: { email: 'a@example.invalid', senha: 'antiga123', id_ambiente: B, perfil_acesso: 'GLOBAL' } }, res);
    assert.equal(res.statusCode, 200); assert.equal(res.envios, 1);
    assert.equal(res.body.message, 'Login realizado com sucesso.');
    assert.equal(String(res.body.data.usuario.id_usuario), '10'); assert.equal(res.body.data.usuario.perfil_acesso, 'ADMINISTRADOR');
    assert.equal(res.body.data.usuario.senha_hash, undefined);
    const claims = jwt.verify(res.body.data.token, 'segredo-ficticio-regressoes-bigint');
    assert.equal(claims.sub, '10'); assert.equal(claims.id_ambiente, undefined);
    assert.equal(c.consultas.filter(q => q.sql.includes('WHERE LOWER(u.email)')).length, 2);
  });
}

for (const env of [A, B]) for (const textual of [false, true]) {
  const id = env === A ? 10 : 20;
  const opcoes = env === A ? { idA: textual ? String(id) : id } : { idB: textual ? String(id) : id };
  test(`[identidade] ${env} origem ${textual ? 'INT8 textual' : 'numérica'}`, async t => {
    const c = preparar(t, opcoes); const { req, avancou } = await c.autenticar(env);
    assert.equal(avancou, true);
    assert.strictEqual(req.usuario.id_usuario, id, 'identidade interna deve preservar o contrato numérico seguro');
    assert.equal(req.usuario.id_ambiente, env);
    assert.equal(c.consultas.length, 1);
    assert.deepEqual(c.consultas[0].params, [id]);
  });
  for (const operacao of ['perfil', 'atualizarPerfil', 'senha']) {
    test(`[conta] ${operacao} ${env} origem ${textual ? 'textual' : 'numérica'}`, async t => {
      const c = preparar(t, opcoes); let resultado, executada = false;
      await c.autenticar(env, async req => {
        executada = true;
        if (operacao === 'perfil') resultado = await c.contaService.buscarPerfil(req.usuario);
        if (operacao === 'atualizarPerfil') resultado = await c.contaService.atualizarPerfil({ ...perfil, id_usuario: 999, id_ambiente: env === A ? B : A, perfil_acesso: 'GLOBAL' }, req.usuario);
        if (operacao === 'senha') await c.contaService.alterarSenha(senha, req.usuario);
      });
      assert.equal(executada, true);
      const atual = c.usuarios.find(u => u.id_ambiente === env);
      if (operacao === 'senha') assert.equal(atual.senha_hash, 'hash:novaSenha123');
      else { assert.equal(String(resultado.id_usuario), String(id)); assert.equal(resultado.senha_hash, undefined); }
      assert.equal(atual.id_ambiente, env); assert.equal(atual.perfil_acesso, 'ADMINISTRADOR');
      if (operacao !== 'perfil') assert.deepEqual(c.liberacoes, [[]]);
    });
  }
  for (const operacao of ['listar', 'buscar', 'atualizar', 'status']) {
    test(`[administração] ${operacao} ${env} origem ${textual ? 'textual' : 'numérica'}`, async t => {
      const c = preparar(t, opcoes); let resultado;
      await c.autenticar(env, async req => {
        if (operacao === 'listar') resultado = await c.usuarioService.listarUsuarios(req.usuario);
        if (operacao === 'buscar') resultado = await c.usuarioService.buscarUsuarioPorId(String(id), req.usuario);
        if (operacao === 'atualizar') resultado = await c.usuarioService.atualizarUsuario(String(id), escritaAdmin, req.usuario);
        if (operacao === 'status') resultado = await c.usuarioService.alterarStatusUsuario(String(id), { ativo: false }, req.usuario);
      });
      const registros = Array.isArray(resultado) ? resultado : [resultado];
      assert.equal(registros.length, 1); assert.equal(String(registros[0].id_usuario), String(id));
      assert.equal(registros[0].id_ambiente, env); assert.equal(registros[0].senha_hash, undefined);
    });
  }
  test(`[convite] emissão ${env} origem ${textual ? 'textual' : 'numérica'}`, async t => {
    const c = preparar(t, opcoes);
    const { res } = await c.autenticar(env, async (req, res) => {
      req.body = { email: 'convidado@example.invalid', perfilAcesso: 'ENGENHEIRO_SEGURANCA', id_ambiente: env === A ? B : A, id_usuario: 999 };
      await c.conviteController.emitir(req, res);
    });
    assert.equal(res.statusCode, 201); assert.equal(res.envios, 1);
    assert.equal(res.body.data.convite.id_ambiente, env); assert.equal(String(res.body.data.convite.id_usuario_convite), String(id));
    assert.match(res.body.data.token, /^[a-f0-9]{64}$/);
    assert.equal(JSON.stringify(c.logs).includes(res.body.data.token), false);
  });
  test(`[Excel] ${env} identidade de origem ${textual ? 'textual' : 'numérica'}`, async t => {
    const c = preparar(t, opcoes); let buffer;
    await c.autenticar(env, async req => { buffer = await c.excel.gerarExcelLocais(req.usuario); });
    assert.ok(Buffer.isBuffer(buffer));
    const workbook = new c.ExcelJS.Workbook(); await workbook.xlsx.load(buffer);
    const sheet = workbook.getWorksheet('Locais'); assert.ok(sheet); assert.equal(sheet.columnCount, 12); assert.equal(sheet.rowCount, 2);
    assert.equal(sheet.getCell('A2').value, env === A ? 'CAMPANHA_A' : 'CAMPANHA_B');
    assert.equal(sheet.getCell('B2').value, env === A ? 'LOCAL_A' : 'LOCAL_B');
    const celulas = JSON.stringify(sheet.getSheetValues());
    assert.equal(celulas.includes(env === A ? 'LOCAL_B' : 'LOCAL_A'), false);
  });
}

for (const origem of [10, '10']) for (const env of [A, B]) {
  test(`[isolamento] usuário externo e inexistente indistinguíveis ${env} origem ${typeof origem}`, async t => {
    const opcoes = env === A ? { idA: origem } : { idB: typeof origem === 'string' ? '20' : 20 };
    const c = preparar(t, opcoes);
    await c.autenticar(env, async req => {
      for (const alvo of [env === A ? '20' : '10', '999']) {
        await assert.rejects(c.usuarioService.buscarUsuarioPorId(alvo, req.usuario), { statusCode: 404, message: 'Usuário não encontrado.' });
      }
    });
    assert.equal(c.consultas.some(q => q.sql.startsWith('UPDATE')), false);
  });
}

for (const env of [A, B]) for (const texto of [false, true]) for (const operacao of ['gerar', 'download']) {
  test(`[PDF] ${operacao} ${env} IDs de registro ${texto ? 'textuais' : 'numéricos'}`, async t => {
    const c = preparar(t, { idRelatorio: texto ? '7' : 7, idLocal: texto ? '40' : 40 });
    const registro = c.relatorios.find(r => r.id_ambiente === env);
    if (env === B && texto) { registro.id_relatorio = '8'; registro.id_local = '50'; }
    const usuario = { id_usuario: env === A ? 10 : 20, id_ambiente: env, eh_fundador: true, perfil_acesso: 'ADMINISTRADOR' };
    const resultado = operacao === 'gerar'
      ? await c.relatorio.gerarPdfRelatorio(String(registro.id_relatorio), usuario)
      : await c.relatorio.obterPdfParaDownload(String(registro.id_relatorio), usuario);
    if (operacao === 'download') assert.deepEqual(resultado.buffer, PDF);
    else assert.equal(String(resultado.relatorio.id_local), env === A ? '40' : '50');
    assert.ok(c.fisico.some(chamada => chamada[0] === 'open'));
    for (const chamada of c.fisico.filter(chamada => chamada[0] === 'open')) assert.equal(chamada[1].includes(env === A ? B : A), false);
  });
}
for (const alvo of [7, '7']) {
  test(`[PDF isolamento] ID ${typeof alvo} externo não alcança filesystem`, async t => {
    const c = preparar(t);
    await assert.rejects(c.relatorio.obterPdfParaDownload(alvo, { id_usuario: 20, id_ambiente: B }), { statusCode: 404 });
    assert.deepEqual(c.fisico, []);
  });
}

for (const env of [A, B]) for (const idUsuario of [env === A ? 10 : 20, env === A ? '10' : '20']) {
  test(`[offline] respostas/snapshots preservados ${env} ator ${typeof idUsuario}`, async t => {
    const c = preparar(t); const usuario = { id_usuario: idUsuario, id_ambiente: env };
    const resultado = await c.sync.listarSincronizacoes(usuario);
    assert.equal(resultado.length, 1);
    const esperado = c.sincronizacoes.find(s => s.id_ambiente === env);
    assert.strictEqual(resultado[0], esperado);
    assert.deepEqual(resultado[0].dados_servidor, esperado.dados_servidor);
    assert.equal(resultado[0].id_registro_cliente, null); assert.equal(resultado[0].dados_resolvidos, null);
    assert.equal(resultado[0].id_operacao_cliente, UUID);
    assert.equal(resultado[0].id_ambiente, env);
    const individual = await c.sync.buscarSincronizacaoPorId(String(esperado.id_sincronizacao), usuario);
    assert.strictEqual(individual, esperado);
    await assert.rejects(c.sync.buscarSincronizacaoPorId(env === A ? '61' : '60', usuario), { statusCode: 404 });
  });
}

// Limites já declarados pela aplicação: não exige suportar toda a faixa INT8
// nem rejeitar notações numéricas alternativas ainda sem decisão de contrato.
for (const alvo of [1, '1', Number.MAX_SAFE_INTEGER, String(Number.MAX_SAFE_INTEGER)]) {
  test(`[limite válido] ID ${JSON.stringify(alvo)} chega exatamente ao SQL`, async t => {
    const c = preparar(t);
    await assert.rejects(async () => c.sync.buscarSincronizacaoPorId(alvo, { id_usuario: '10', id_ambiente: A }), { statusCode: 404 });
    assert.equal(c.consultas.length, 1); assert.strictEqual(c.consultas[0].params[2], Number(alvo));
    assert.equal(c.consultas[0].params[0], A);
  });
}
for (const alvo of [0, '0', -1, '-1', '', 'abc', '10x', '1.5', 1.5, true, [], {}, null, undefined,
  NaN, Infinity, '9007199254740992', '9007199254740993', '9223372036854775807']) {
  test(`[entrada inválida] ${typeof alvo} ${JSON.stringify(alvo)} não consulta SQL`, async t => {
    const c = preparar(t);
    await assert.rejects(async () => c.sync.buscarSincronizacaoPorId(alvo, { id_usuario: '10', id_ambiente: A }), { statusCode: 400 });
    assert.equal(c.consultas.length, 0);
  });
}
for (const env of [null, undefined, '', 'ambiente', 10, UUID.replace(/-/g, '')]) {
  test(`[UUID inválido] ${JSON.stringify(env)} não consulta SQL`, async t => {
    const c = preparar(t);
    await assert.rejects(async () => c.sync.listarSincronizacoes({ id_usuario: '10', id_ambiente: env }), { statusCode: 401 });
    assert.equal(c.consultas.length, 0);
  });
}
for (const idUsuario of [0, '0', null, undefined, true, '9007199254740992', '9223372036854775807']) {
  test(`[identidade inválida] ${JSON.stringify(idUsuario)} não consulta SQL`, async t => {
    const c = preparar(t);
    await assert.rejects(async () => c.sync.listarSincronizacoes({ id_usuario: idUsuario, id_ambiente: A }), { statusCode: 401 });
    assert.equal(c.consultas.length, 0);
  });
}
for (const estado of ['usuario', 'ambiente']) {
  test(`[inatividade] ID textual não autoriza ${estado} inativo`, async t => {
    const c = preparar(t); if (estado === 'usuario') c.usuarios[0].ativo = false; else c.ativo[A] = false;
    const r = await c.autenticar(A);
    assert.equal(r.avancou, false); assert.equal(r.res.statusCode, 401); assert.equal(r.res.envios, 1);
  });
}
