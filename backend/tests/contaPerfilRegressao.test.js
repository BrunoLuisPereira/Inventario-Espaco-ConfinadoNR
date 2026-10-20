const test = require('node:test');
const assert = require('node:assert/strict');
const { preparar, A, B } = require('./helpers/contaSimulada.cjs');
const senha = { senhaAtual: 'antiga123', novaSenha: 'novaSenha123', confirmarSenha: 'novaSenha123' };
const perfil = { nome: ' Novo nome ', email: ' NOVO@example.invalid ' };
const escritas = c => c.eventos.filter(e => e.sql?.startsWith('UPDATE'));
const comandos = c => c.eventos.filter(e => ['BEGIN', 'COMMIT', 'ROLLBACK'].includes(e.sql)).map(e => e.sql);
const erroPublico = (c, status, message) => {
  assert.equal(c.res.statusCode, status);
  assert.equal(c.res.envios, 1);
  assert.deepEqual(c.res.body, { status: 'error', message });
};

test('perfil: não permite restaurar perfil revogado', async t => {
  const c = preparar(t, { antesUsuario: s => { s.usuario.perfil_acesso = 'ENGENHEIRO_SEGURANCA'; } });
  await c.executar('put', '/perfil', perfil);
  assert.equal(c.res.statusCode, 200);
  assert.equal(c.estado.usuario.perfil_acesso, 'ENGENHEIRO_SEGURANCA');
  assert.equal(c.res.body.data.perfil_acesso, 'ENGENHEIRO_SEGURANCA');
  assert.deepEqual(comandos(c), ['BEGIN', 'COMMIT']);
});
test('perfil: não permite apropriar e-mail reservado', async t => {
  const c = preparar(t, { estado: { reservado: true } });
  await c.executar('put', '/perfil', perfil);
  erroPublico(c, 409, 'Este e-mail não está disponível para alteração.');
  assert.equal(escritas(c).length, 0);
  assert.equal(c.estado.usuario.email, 'original@example.invalid');
  assert.deepEqual(comandos(c), ['BEGIN', 'ROLLBACK']);
});

for (const ambiente of [A, B]) for (const papel of ['ADMINISTRADOR', 'ENGENHEIRO_SEGURANCA']) {
  for (const [method, caminho] of [['get', '/me'], ['get', '/perfil'], ['put', '/perfil'], ['put', '/senha']]) {
    test(`contrato ${method} ${caminho}: ${ambiente} ${papel}`, async t => {
      const c = preparar(t, { usuario: { id_ambiente: ambiente, eh_fundador: papel === "ADMINISTRADOR", perfil_acesso: papel } });
      const { req } = await c.executar(method, caminho, caminho === '/senha' ? senha : perfil);
      assert.equal(c.res.statusCode, 200);
      assert.equal(c.res.envios, 1);
      assert.equal(c.res.body.status, 'success');
      assert.deepEqual(req.usuario, { id_usuario: 1, id_ambiente: ambiente, eh_fundador: papel === "ADMINISTRADOR", perfil_acesso: papel });
      if (caminho === '/me') {
        assert.deepEqual(c.res.body, { status: 'success', message: 'Usuário autenticado.', data: { id_usuario: 1, perfil_acesso: papel } });
      } else if (caminho === '/senha') {
        assert.deepEqual(c.res.body, { status: 'success', message: 'Senha alterada com sucesso.' });
        assert.equal(c.estado.usuario.senha_hash, 'hash:novaSenha123');
        assert.deepEqual(c.bcryptChamadas, [['compare', 'antiga123', 'hash:antiga123'], ['hash', 'novaSenha123', 12]]);
      } else {
        assert.equal(c.res.body.message, method === 'get' ? 'Perfil consultado com sucesso.' : 'Perfil atualizado com sucesso.');
        assert.deepEqual(c.res.body.data, c.publico(c.estado.usuario));
        assert.equal('senha_hash' in c.res.body.data, false);
        assert.equal('id_ambiente' in c.res.body.data, false);
      }
      if (method === 'put') {
        assert.deepEqual(comandos(c), ['BEGIN', 'COMMIT']);
        assert.deepEqual(c.eventos.at(-1), { release: [] });
      }
    });
  }
}

for (const [method, caminho] of [['get', '/me'], ['get', '/perfil'], ['put', '/perfil'], ['put', '/senha']]) {
  for (const token of [null, 'invalido', 'expirado']) {
    test(`JWT ${token}: ${method} ${caminho}`, async t => {
      const c = preparar(t);
      await c.executar(method, caminho, perfil, token);
      assert.equal(c.res.statusCode, 401); assert.equal(c.res.envios, 1);
      assert.deepEqual(c.eventos, []);
      assert.equal(c.res.body.status, 'error');
      assert.equal(JSON.stringify(c.res.body).includes('TOKEN INTERNO'), false);
    });
  }
  for (const inativo of ['usuario', 'ambiente']) {
    test(`${inativo} inativo: ${method} ${caminho}`, async t => {
      const c = preparar(t, inativo === 'usuario' ? { usuario: { ativo: false } } : { estado: { ambienteAtivo: false } });
      await c.executar(method, caminho, perfil);
      assert.equal(c.res.statusCode, 401); assert.equal(escritas(c).length, 0);
      assert.equal(c.eventos.some(e => e.connect), false);
    });
  }
  test(`headersSent na entrada: ${method} ${caminho}`, async t => {
    const c = preparar(t); c.res.headersSent = true;
    await c.executar(method, caminho, perfil);
    assert.equal(c.res.envios, 0); assert.equal(c.eventos.length, 0);
  });
  test(`headersSent durante autenticação: ${method} ${caminho}`, async t => {
    let c; c = preparar(t, { duranteIdentidade: () => { c.res.headersSent = true; } });
    await c.executar(method, caminho, perfil);
    assert.equal(c.res.envios, 0); assert.equal(escritas(c).length, 0);
  });
  test(`falha JSON após início: ${method} ${caminho}`, async t => {
    const c = preparar(t, { jsonFalha: true });
    await c.executar(method, caminho, caminho === '/senha' ? senha : perfil);
    assert.equal(c.res.envios, 1); assert.equal(c.res.statusCode, 200);
  });
}

for (const campo of ['nome', 'email']) {
  test(`perfil parcial preserva ${campo} omitido`, async t => {
    const c = preparar(t);
    const antes = c.estado.usuario[campo];
    await c.executar('put', '/perfil', campo === 'nome' ? { email: 'outra@example.invalid' } : { nome: 'Outro' });
    assert.equal(c.res.statusCode, 200); assert.equal(c.estado.usuario[campo], antes);
    if (campo === 'email') assert.equal(c.eventos.some(e => e.sql?.includes('pg_advisory')), false);
  });
}
test('perfil/ambiente/identidade/status forjados não são escritos', async t => {
  const c = preparar(t, { usuario: { eh_fundador: false, perfil_acesso: 'ENGENHEIRO_SEGURANCA' } });
  await c.executar('put', '/perfil', { ...perfil, id_usuario: 999, id_ambiente: B, eh_fundador: true, perfil_acesso: 'ADMINISTRADOR', perfilAcesso: 'ADMINISTRADOR', ativo: false, senha_hash: 'forjado' });
  assert.equal(c.res.statusCode, 200);
  assert.equal(c.estado.usuario.id_usuario, 1); assert.equal(c.estado.usuario.id_ambiente, A);
  assert.equal(c.estado.usuario.perfil_acesso, 'ENGENHEIRO_SEGURANCA');
  assert.equal(c.estado.usuario.ativo, true); assert.equal(c.estado.usuario.senha_hash, 'hash:antiga123');
});
for (const body of [undefined, null, {}, [], { nome: null }, { email: '' }, { nome: 1 }, { email: true }]) {
  test('perfil rejeita dados inválidos: ' + JSON.stringify(body), async t => {
    const c = preparar(t); await c.executar('put', '/perfil', body);
    erroPublico(c, 400, 'Nome e e-mail são obrigatórios.');
    assert.equal(c.eventos.some(e => e.connect), false);
  });
}
for (const tipo of ['duplicado', 'concorrente']) {
  test('e-mail global ' + tipo + ' bloqueia sem revelar outro ambiente', async t => {
    const c = preparar(t, tipo === 'duplicado' ? { estado: { outroEmail: 'novo@example.invalid' } } :
      { antesUsuario: s => { s.outroEmail = 'novo@example.invalid'; } });
    await c.executar('put', '/perfil', perfil);
    erroPublico(c, 409, 'Já existe outro usuário com este e-mail.');
    assert.equal(escritas(c).length, 0); assert.deepEqual(comandos(c), ['BEGIN', 'ROLLBACK']);
    const consultas = c.eventos.filter(e => e.sql);
    assert.ok(consultas.findIndex(e => e.sql.includes('pg_advisory')) < consultas.findIndex(e => e.sql.endsWith('FOR SHARE')));
  });
}
test('e-mail inalterado não é bloqueado por reserva histórica', async t => {
  const c = preparar(t, { estado: { reservado: true } });
  await c.executar('put', '/perfil', { nome: 'Novo', email: ' ORIGINAL@example.invalid ' });
  assert.equal(c.res.statusCode, 200);
  assert.equal(c.eventos.some(e => e.sql?.includes('FROM convite')), false);
});

for (const caminho of ['/perfil', '/senha']) {
  for (const tipo of ['usuario', 'ambiente', 'perfil']) {
    test(`revogação antes do bloqueio ${tipo}: ${caminho}`, async t => {
      const opcoes = tipo === 'ambiente' ? { antesAmbiente: s => { s.ambienteAtivo = false; } } :
        { antesUsuario: s => { if (tipo === 'usuario') s.usuario.ativo = false; else s.usuario.perfil_acesso = 'REVOGADO'; } };
      const c = preparar(t, opcoes);
      await c.executar('put', caminho, caminho === '/senha' ? senha : perfil);
      assert.equal(c.res.statusCode, tipo === 'perfil' ? 403 : 401);
      assert.equal(escritas(c).length, 0); assert.deepEqual(comandos(c), ['BEGIN', 'ROLLBACK']);
      assert.deepEqual(c.eventos.at(-1), { release: [] });
    });
  }
  for (const etapa of ['BEGIN', 'FOR SHARE', 'FOR UPDATE', 'UPDATE usuario', 'COMMIT']) {
    test(`falha transacional ${etapa}: ${caminho}`, async t => {
      const c = preparar(t, { falhar: sql => sql.includes(etapa) });
      const antes = { ...c.estado.usuario };
      await c.executar('put', caminho, caminho === '/senha' ? senha : perfil);
      assert.equal(c.res.statusCode, 500); assert.equal(c.res.envios, 1);
      assert.deepEqual(c.estado.usuario, antes);
      assert.equal(c.res.body.message, caminho === '/senha' ? 'Erro interno ao alterar senha.' : 'Erro interno ao atualizar perfil.');
      assert.equal(JSON.stringify([c.logs, c.res.body]).includes('SQL TOKEN SENHA'), false);
      assert.deepEqual(c.eventos.at(-1), { release: etapa === 'BEGIN' ? [true] : [] });
      if (etapa !== 'BEGIN') assert.equal(comandos(c).at(-1), 'ROLLBACK');
    });
  }
  test(`rollback falho descarta conexão preservando erro: ${caminho}`, async t => {
    const c = preparar(t, { falhar: sql => sql.startsWith('UPDATE') || sql === 'ROLLBACK' });
    await c.executar('put', caminho, caminho === '/senha' ? senha : perfil);
    assert.equal(c.res.statusCode, 500); assert.deepEqual(c.eventos.at(-1), { release: [true] });
    assert.equal(comandos(c).includes('COMMIT'), false);
  });
  test(`UPDATE vazio é técnico: ${caminho}`, async t => {
    const c = preparar(t, { updateVazio: true });
    await c.executar('put', caminho, caminho === '/senha' ? senha : perfil);
    assert.equal(c.res.statusCode, 500); assert.deepEqual(comandos(c), ['BEGIN', 'ROLLBACK']);
  });
  test(`falha de aquisição: ${caminho}`, async t => {
    const c = preparar(t, { falhaConnect: true });
    await c.executar('put', caminho, caminho === '/senha' ? senha : perfil);
    assert.equal(c.res.statusCode, 500);
    assert.equal(c.eventos.some(e => e.release), false);
  });
}
test('senha concorrente é verificada contra hash atual sob lock', async t => {
  const c = preparar(t, { antesUsuario: s => { s.usuario.senha_hash = 'hash:alteradaPorOutraRequisicao'; } });
  await c.executar('put', '/senha', senha);
  erroPublico(c, 400, 'A senha atual está incorreta.');
  assert.equal(escritas(c).length, 0);
  assert.equal(c.estado.usuario.senha_hash, 'hash:alteradaPorOutraRequisicao');
  assert.deepEqual(c.bcryptChamadas, [['compare', 'antiga123', 'hash:alteradaPorOutraRequisicao']]);
});
for (const [dados, message] of [
  [{}, 'Informe a senha atual.'],
  [{ ...senha, novaSenha: 'curta' }, 'A nova senha deve possuir pelo menos 8 caracteres.'],
  [{ ...senha, confirmarSenha: 'outra' }, 'A confirmação da nova senha não confere.'],
  [{ senhaAtual: 'antiga123', novaSenha: 'antiga123', confirmarSenha: 'antiga123' }, 'A nova senha deve ser diferente da senha atual.'],
  [{ ...senha, senhaAtual: 'errada123' }, 'A senha atual está incorreta.'],
]) {
  test('senha validação: ' + message, async t => {
    const c = preparar(t); await c.executar('put', '/senha', dados);
    erroPublico(c, 400, message); assert.equal(escritas(c).length, 0);
  });
}
for (const identidade of [undefined, {}, { id_usuario: 0, id_ambiente: A }, { id_usuario: Number.MAX_SAFE_INTEGER + 1, id_ambiente: A }, { id_usuario: 1, id_ambiente: 'invalido' }]) {
  test('repositório rejeita identidade inválida antes da conexão: ' + JSON.stringify(identidade), async t => {
    const c = preparar(t);
    await assert.rejects(c.repository.buscarPerfil(identidade), { statusCode: 401 });
    await assert.rejects(c.repository.atualizarPerfil(identidade, {}), { statusCode: 401 });
    assert.equal(c.eventos.length, 0);
  });
}
for (const statusCode of [undefined, '401', true, [], {}, 400.5, NaN, Infinity, 200, 399, 600, 500, 503, 401]) {
  test('erro técnico não vira negócio pelo status: ' + String(statusCode), async t => {
    const c = preparar(t, { falhar: sql => sql.startsWith('UPDATE'), erro: Object.assign(new Error('SQL TOKEN SENHA /interno'), { statusCode }) });
    await c.executar('put', '/perfil', perfil);
    erroPublico(c, 500, 'Erro interno ao atualizar perfil.');
    assert.equal(JSON.stringify([c.res.body, c.logs]).includes('SQL TOKEN SENHA'), false);
  });
}
test('23505 inesperado não é convertido em conflito de e-mail', async t => {
  const c = preparar(t, { falhar: sql => sql.startsWith('UPDATE'), erro: Object.assign(new Error('SQL INTERNO'), { code: '23505', constraint: 'outra_constraint' }) });
  await c.executar('put', '/perfil', perfil);
  erroPublico(c, 500, 'Erro interno ao atualizar perfil.');
});
test('falha técnica da identidade é sanitizada no middleware compartilhado', async t => {
  const c = preparar(t, { falhar: sql => sql.includes('JOIN ambiente') });
  await c.executar('get', '/me');
  erroPublico(c, 500, 'Erro interno ao validar a autenticação.');
  assert.equal(JSON.stringify(c.logs).includes('SQL TOKEN SENHA'), false);
});

test('índice específico de e-mail retorna 409 após rollback', async t => {
  const c = preparar(t, { falhar: sql => sql.startsWith('UPDATE'), erro: Object.assign(new Error('DETAIL SQL TOKEN SENHA'), { code: '23505', constraint: 'uq_usuario_email_normalizado' }) });
  await c.executar('put', '/perfil', perfil);
  erroPublico(c, 409, 'Já existe outro usuário com este e-mail.');
  assert.deepEqual(comandos(c), ['BEGIN', 'ROLLBACK']);
  assert.equal(c.estado.usuario.email, 'original@example.invalid');
  assert.equal(JSON.stringify([c.logs, c.res.body]).includes('DETAIL SQL'), false);
});
for (const caminho of ['/perfil', '/senha']) {
  test(`resposta iniciada enquanto escrita está pendente: ${caminho}`, async t => {
    let c; c = preparar(t, { aoCommit: () => { c.res.headersSent = true; } });
    await c.executar('put', caminho, caminho === '/senha' ? senha : perfil);
    assert.equal(c.res.envios, 0);
    assert.deepEqual(comandos(c), ['BEGIN', 'COMMIT']);
    assert.deepEqual(c.eventos.at(-1), { release: [] });
  });
  test(`resposta iniciada durante erro transacional: ${caminho}`, async t => {
    let c; c = preparar(t, { falhar: sql => {
      if (!sql.startsWith('UPDATE')) return false;
      c.res.headersSent = true; return true;
    } });
    await c.executar('put', caminho, caminho === '/senha' ? senha : perfil);
    assert.equal(c.res.envios, 0);
    assert.deepEqual(comandos(c), ['BEGIN', 'ROLLBACK']);
    assert.deepEqual(c.eventos.at(-1), { release: [] });
  });
}
test('router preserva login e apenas os quatro endpoints existentes de conta', t => {
  const c = preparar(t);
  const rotas = c.router.stack.filter(l => l.route).map(l => [Object.keys(l.route.methods)[0], l.route.path]);
  assert.deepEqual(rotas, [['post', '/login'], ['get', '/me'], ['get', '/perfil'], ['put', '/perfil'], ['put', '/senha']]);
  assert.equal(c.router.stack[0].route.stack[0].handle.name, 'loginPreservado');
  for (const layer of c.router.stack.slice(1)) {
    assert.equal(layer.route.stack[0].handle.name, 'autenticarMultiTenant');
    assert.equal(layer.route.stack.length, 2);
  }
});

test('e-mail normalizado e parâmetros SQL não refletem identidade forjada', async t => {
  const c = preparar(t);
  await c.executar('put', '/perfil', { ...perfil, id_usuario: 2, id_ambiente: B });
  const update = escritas(c)[0];
  assert.deepEqual(update.params, [1, A, true, 'Novo nome', true, 'novo@example.invalid']);
  assert.equal(update.sql.includes('novo@example.invalid'), false);
  assert.equal(update.sql.includes(A), false);
});
test('rollback falho mantém a referência do erro técnico original', async t => {
  const original = new Error('falha original simulada');
  const c = preparar(t, { falhar: sql => sql.startsWith('UPDATE') || sql === 'ROLLBACK', erro: original });
  await assert.rejects(c.service.atualizarPerfil(perfil, c.identidade()), erro => erro === original);
  assert.deepEqual(c.eventos.at(-1), { release: [true] });
});
for (const caminho of ['/me', '/perfil']) {
  test(`resposta iniciada durante consulta de conta: ${caminho}`, async t => {
    let c; c = preparar(t, { durantePerfil: () => { c.res.headersSent = true; } });
    await c.executar('get', caminho);
    assert.equal(c.res.envios, 0);
    assert.equal(c.eventos.filter(e => e.sql).length, 2);
  });
  test(`inatividade após middleware é recusada pela consulta: ${caminho}`, async t => {
    const c = preparar(t, { durantePerfil: estado => { estado.usuario.ativo = false; } });
    await c.executar('get', caminho);
    assert.equal(c.res.statusCode, 401);
    assert.equal(c.res.body.status, 'error');
    assert.equal(c.res.envios, 1);
  });
}
