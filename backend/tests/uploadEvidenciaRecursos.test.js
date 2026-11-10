const test = require('node:test');
const assert = require('node:assert/strict');
const { Readable, PassThrough } = require('node:stream');
const { EventEmitter } = require('node:events');
const { uploadEvidencia } = require('../src/middlewares/uploadEvidenciaMiddleware');
const boundary = 'RECURSOS_SINTETICOS';
const MAX = 12 * 1024 * 1024;
const respostas = new Set();
test.afterEach(() => { for (const res of respostas) res.emit('finish'); respostas.clear(); });
const campo = (nome, valor = '10') => Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${nome}"\r\n\r\n${valor}\r\n`);
const arquivo = (tamanho = 8) => Buffer.concat([
  Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="arquivo"; filename="foto.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`),
  Buffer.alloc(tamanho), Buffer.from('\r\n'),
]);
const corpo = (...partes) => Buffer.concat([...partes, Buffer.from(`--${boundary}--\r\n`)]);
function preparar(req, usuario = 1, ambiente = 'A', tamanho) {
  req.headers = { 'content-type': `multipart/form-data; boundary=${boundary}` };
  if (tamanho !== undefined) req.headers['content-length'] = String(tamanho);
  req.usuario = { id_usuario: usuario, id_ambiente: ambiente };
  return req;
}
function executar(req) {
  let chamadas = 0;
  const res = new EventEmitter();
  res.status = code => { res.statusCode = code; return res; };
  res.json = body => { res.body = body; res.headersSent = true; res.emit('finish'); };
  respostas.add(res);
  const resultado = new Promise(resolve => uploadEvidencia.single('arquivo')(req, res, erro => {
    chamadas++;
    resolve({ erro, req });
  }));
  return { resultado, chamadas: () => chamadas, res, finalizar: () => res.emit('finish') };
}
async function enviar(buffer, tamanho = buffer.length) {
  return executar(preparar(Readable.from([buffer]), 1, 'A', tamanho)).resultado;
}

test('recebe upload válido com ou sem Content-Length sem persistência física', async () => {
  for (const tamanho of [undefined, 'informado']) {
    const buffer = corpo(campo('id_local'), arquivo());
    const req = preparar(Readable.from([buffer]), 1, 'A', tamanho ? buffer.length : undefined);
    const { erro } = await executar(req).resultado;
    assert.ifError(erro);
    assert.equal(req.body.id_local, '10');
    assert.equal(req.file.buffer.length, 8);
    assert.equal(req.file.path, undefined);
    assert.equal(req.file.destination, undefined);
  }
});
test('aceita exatamente 10 MiB e rejeita um byte acima sem entregar arquivo', async () => {
  const valido = await enviar(corpo(arquivo(10 * 1024 * 1024)));
  assert.ifError(valido.erro);
  const invalido = await enviar(corpo(arquivo(10 * 1024 * 1024 + 1)));
  assert.equal(invalido.erro.code, 'LIMIT_FILE_SIZE');
  assert.equal(invalido.req.file, undefined);
});
test('aceita 20 campos e arquivo; rejeita excesso de campos e de partes', async () => {
  const campos = Array.from({ length: 20 }, (_, i) => campo('campo' + i));
  assert.ifError((await enviar(corpo(...campos, arquivo()))).erro);
  const camposDemais = await enviar(corpo(...campos, campo('extra')));
  assert.equal(camposDemais.erro.code, 'LIMIT_FIELD_COUNT');
  // Partes sem Content-Disposition são ignoradas como campos, mas contam.
  const ignorada = Buffer.from(`--${boundary}\r\nX-Test: ignorada\r\n\r\nx\r\n`);
  const partesDemais = await enviar(corpo(...Array(22).fill(ignorada)));
  assert.equal(partesDemais.erro.code, 'LIMIT_PART_COUNT');
});
test('limita corpo declarado antes de ler e corpo real sem Content-Length', async () => {
  const req = preparar(new PassThrough(), 1, 'A', MAX + 1);
  assert.equal((await executar(req).resultado).erro.statusCode, 413);
  assert.equal(req.readableFlowing, null);
  const buffer = corpo(arquivo());
  // Epílogo conta no limite agregado, mesmo não sendo conteúdo de arquivo.
  const fluxo = preparar(Readable.from([buffer, Buffer.alloc(MAX)]));
  const resultado = await executar(fluxo).resultado;
  assert.equal(resultado.erro.statusCode, 413);
  assert.equal(fluxo.file, undefined);
  req.destroy();
});
test('limita tamanho de campo e quantidade de arquivos', async () => {
  assert.equal((await enviar(corpo(campo('descricao', 'x'.repeat(65537))))).erro.code, 'LIMIT_FIELD_VALUE');
  assert.equal((await enviar(corpo(arquivo(), arquivo()))).erro.code, 'LIMIT_FILE_COUNT');
});
test('aceita corpo no limite agregado e rejeita comprimento declarado inválido', async () => {
  const inicio = corpo(arquivo());
  assert.ifError((await enviar(Buffer.concat([inicio, Buffer.alloc(MAX - inicio.length)]))).erro);
  for (const tamanho of ['inválido', '-1', '9007199254740992']) {
    const req = preparar(new PassThrough(), 1, 'A', tamanho);
    assert.equal((await executar(req).resultado).erro.statusCode, 400);
    assert.equal(req.readableFlowing, null);
    req.destroy();
  }
});
test('prazo de 60 segundos encerra recebimento e libera as vagas', async t => {
  const original = global.setTimeout;
  const expirar = [];
  t.mock.method(global, 'setTimeout', (callback, prazo) => {
    assert.equal(prazo, 60000);
    expirar.push(callback);
    return original(callback, prazo);
  });
  const requisicoes = [preparar(new PassThrough()), preparar(new PassThrough())];
  const operacoes = requisicoes.map(executar);
  for (const callback of expirar) callback();
  for (const op of operacoes) {
    const { erro, req } = await op.resultado;
    assert.equal(erro.statusCode, 408);
    assert.equal(req.file, undefined);
    req.destroy();
  }
  t.mock.restoreAll();
  assert.ifError((await enviar(corpo(arquivo()))).erro);
});
test('multipart truncado não entrega arquivo e não retém vaga', async () => {
  const resultado = await enviar(arquivo());
  assert.ok(resultado.erro);
  assert.equal(resultado.req.file, undefined);
  assert.ifError((await enviar(corpo(arquivo()))).erro);
});
test('aborto e erro de origem liberam admissão sem entregar arquivo e chamam next uma vez', async () => {
  for (const evento of ['aborted', 'error', 'close']) {
    const req = preparar(new PassThrough());
    const operacao = executar(req);
    req.write(arquivo(1024));
    req.emit(evento, evento === 'error' ? new Error('falha sintética') : undefined);
    const { erro } = await operacao.resultado;
    assert.equal(erro.statusCode, 400);
    assert.equal(req.file, undefined);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(operacao.chamadas(), 1);
    req.destroy();
  }
  assert.ifError((await enviar(corpo(arquivo()))).erro);
});
test('concorrência por identidade e global é limitada e liberada sem misturar ambientes', async () => {
  const pendentes = [];
  const iniciar = (usuario, ambiente) => {
    const req = preparar(new PassThrough(), usuario, ambiente);
    const op = executar(req);
    pendentes.push({ req, op });
    return op;
  };
  try {
    iniciar(1, 'A'); iniciar(1, 'A');
    const bloqueado = preparar(new PassThrough(), 1, 'A');
    assert.equal((await executar(bloqueado).resultado).erro.statusCode, 429);
    assert.equal(bloqueado.readableFlowing, null);
    bloqueado.destroy();
    iniciar(1, 'B'); iniciar(2, 'B');
    const global = preparar(new PassThrough(), 3, 'C');
    assert.equal((await executar(global).resultado).erro.statusCode, 429);
    global.destroy();
    for (const { req } of pendentes) req.end(corpo(campo('id_local', req.usuario.id_ambiente), arquivo()));
    for (const { req, op } of pendentes) {
      assert.ifError((await op.resultado).erro);
      assert.equal(req.body.id_local, req.usuario.id_ambiente);
      assert.equal(req.file.path, undefined);
      op.finalizar();
    }
  } finally {
    for (const { req } of pendentes) req.destroy();
  }
  assert.ifError((await enviar(corpo(arquivo()))).erro);
});

test('seis uploads do mesmo usuário retêm somente dois buffers durante controller lento', async () => {
  const operacoes = [], resultados = [];
  // Repete a reprodução da auditoria: cada corpo termina, mas as respostas e
  // o processamento dos anteriores permanecem pendentes antes da próxima tentativa.
  for (let i = 0; i < 6; i++) {
    const op = executar(preparar(Readable.from([corpo(arquivo(1024 * 1024))])));
    operacoes.push(op);
    resultados.push(await op.resultado);
  }
  assert.equal(resultados.filter(r => !r.erro).length, 2);
  assert.equal(resultados.filter(r => r.erro?.statusCode === 429).length, 4);
  const aceitos = resultados.filter(r => !r.erro);
  assert.equal(aceitos.reduce((n, r) => n + r.req.file.buffer.length, 0), 2 * 1024 * 1024);
  let soltar;
  const espera = new Promise(resolve => { soltar = resolve; });
  const usos = aceitos.map(({ req }) => req.uploadEvidenciaRecursos.usarArquivo(async file => {
    await espera;
    assert.equal(file.buffer.length, 1024 * 1024, 'Não libera buffer em uso mesmo após resposta encerrada');
  }));
  operacoes[0].res.emit('close');
  operacoes[1].res.emit('finish');
  assert.equal((await enviar(corpo(arquivo()))).erro.statusCode, 429);
  soltar();
  await Promise.all(usos);
  for (const { req } of aceitos) assert.equal(req.file, undefined);
  // Eventos repetidos não devolvem vagas adicionais.
  for (const op of operacoes) op.finalizar();
  const novos = Array.from({ length: 3 }, () => executar(preparar(Readable.from([corpo(arquivo())]))));
  const novamente = await Promise.all(novos.map(o => o.resultado));
  assert.equal(novamente.filter(r => !r.erro).length, 2);
  assert.equal(novamente.filter(r => r.erro?.statusCode === 429).length, 1);
});

test('sucesso, erro de processamento, aborto e encerramento antecipado descartam buffer e liberam uma vez', async () => {
  for (const evento of ['finish', 'close', 'error', 'aborted', 'falha']) {
    const op = executar(preparar(Readable.from([corpo(arquivo())])));
    const { req, erro } = await op.resultado;
    assert.ifError(erro);
    if (evento === 'falha') {
      await assert.rejects(req.uploadEvidenciaRecursos.usarArquivo(async () => { throw new Error('Sintético'); }), /Sintético/);
    } else if (evento === 'aborted') req.emit('aborted');
    else op.res.emit(evento);
    assert.equal(req.file, undefined);
    req.uploadEvidenciaRecursos.finalizar();
    req.uploadEvidenciaRecursos.finalizar();
    assert.equal(op.chamadas(), 1);
    const controle = executar(preparar(Readable.from([corpo(arquivo())])));
    assert.ifError((await controle.resultado).erro);
    controle.finalizar();
  }
});

test('timeout após multipart descarta buffer ocioso, mas aguarda escrita em curso', async t => {
  const original = global.setTimeout;
  const expirar = [];
  t.mock.method(global, 'setTimeout', (fn, prazo) => { expirar.push(fn); return original(fn, prazo); });
  const ocioso = executar(preparar(Readable.from([corpo(arquivo())])));
  const ativo = executar(preparar(Readable.from([corpo(arquivo())])));
  const [a, b] = await Promise.all([ocioso.resultado, ativo.resultado]);
  let soltar;
  const uso = b.req.uploadEvidenciaRecursos.usarArquivo(() => new Promise(resolve => { soltar = resolve; }));
  for (const expirarAgora of expirar) expirarAgora();
  assert.equal(a.req.file, undefined);
  assert.ok(b.req.file.buffer);
  assert.equal(ocioso.res.statusCode, 408);
  assert.equal(ativo.res.statusCode, 408);
  soltar();
  await uso;
  assert.equal(b.req.file, undefined);
  assert.equal(ocioso.chamadas(), 1);
  assert.equal(ativo.chamadas(), 1);
});

function carregarController(t, prepararUpload, persistirUploadAutorizado, criarEvidencia = async () => ({ criada: true, evidencia: {} })) {
  const Module = require('node:module');
  const alvo = require.resolve('../src/controllers/evidenciaController');
  const anterior = require.cache[alvo];
  delete require.cache[alvo];
  t.after(() => { if (anterior) require.cache[alvo] = anterior; else delete require.cache[alvo]; });
  const load = Module._load;
  t.mock.method(Module, '_load', function (nome, parent, ...args) {
    if (parent?.filename === alvo) {
      if (nome === '../services/evidenciaMultiTenantService') return { prepararUpload, criarEvidencia };
      if (nome === '../utils/evidenciaArquivoUtils') return {
        validarUpload(file) { assert.ok(file.buffer); return { tipo: 'FOTO' }; }, persistirUploadAutorizado,
      };
      throw new Error('Dependência real proibida');
    }
    return load.call(this, nome, parent, ...args);
  });
  return require(alvo);
}

test('controller aguardando autorização não persiste após abandono e descarta o buffer', async t => {
  let autorizar;
  let persistencias = 0;
  const espera = new Promise(resolve => { autorizar = resolve; });
  const c = carregarController(t, () => espera, async () => { persistencias++; });
  const op = executar(preparar(Readable.from([corpo(arquivo())])));
  const { req } = await op.resultado;
  const andamento = c.criarComUpload(req, op.res, () => assert.fail('Não deve encaminhar erro após abandono'));
  assert.ok(req.file.buffer);
  op.res.destroyed = true;
  op.res.emit('close');
  assert.equal(req.file, undefined);
  autorizar({ dados: { id_local: 10 } });
  await andamento;
  assert.equal(persistencias, 0);
  assert.ifError((await enviar(corpo(arquivo()))).erro);
});

for (const caso of ['sucesso', 'falha', 'aborto', 'timeout']) {
  test(`controller real com persistência lenta: ${caso}`, async t => {
    let soltar, iniciou;
    const comecou = new Promise(resolve => { iniciou = resolve; });
    const espera = new Promise(resolve => { soltar = resolve; });
    let gravacoes = 0;
    const c = carregarController(t, async () => ({ dados: { id_local: 10 } }), async (file, usuario, local) => {
      assert.equal(usuario.id_ambiente, 'A');
      assert.equal(local, 10);
      iniciou();
      await espera;
      assert.ok(file.buffer, 'Escrita ainda é dona do buffer');
      if (caso === 'falha') throw new Error('Falha sintética');
      return { caminho_arquivo: 'simulado' };
    }, async () => { gravacoes++; return { criada: true, evidencia: {} }; });
    let expirar;
    const timer = global.setTimeout;
    t.mock.method(global, 'setTimeout', (fn, prazo) => {
      if (prazo === 60000) expirar = fn;
      return timer(fn, prazo);
    });
    const op = executar(preparar(Readable.from([corpo(arquivo())])));
    const { req } = await op.resultado;
    const erros = [];
    const andamento = c.criarComUpload(req, op.res, e => erros.push(e));
    await comecou;
    if (caso === 'aborto') { op.res.destroyed = true; op.res.emit('close'); }
    if (caso === 'timeout') expirar();
    assert.ok(req.file.buffer);
    const segundo = executar(preparar(Readable.from([corpo(arquivo())])));
    assert.ifError((await segundo.resultado).erro);
    assert.equal((await enviar(corpo(arquivo()))).erro.statusCode, 429);
    segundo.finalizar();
    soltar();
    await andamento;
    assert.equal(req.file, undefined);
    assert.equal(erros.length, caso === 'falha' ? 1 : 0);
    assert.equal(gravacoes, caso === 'falha' ? 0 : 1);
    if (caso === 'sucesso') assert.equal(op.res.statusCode, 201);
    if (caso === 'timeout') assert.equal(op.res.statusCode, 408);
    if (caso === 'aborto') assert.equal(op.res.statusCode, undefined);
    assert.ifError((await enviar(corpo(arquivo()))).erro);
  });
}

test('limite global continua quatro com buffers prontos, isolando usuário e ambiente', async () => {
  const identidades = [[1, 'A'], [1, 'A'], [1, 'B'], [2, 'B']];
  const ops = identidades.map(([id, ambiente]) => executar(preparar(Readable.from([corpo(arquivo())]), id, ambiente)));
  const resultados = await Promise.all(ops.map(op => op.resultado));
  resultados.forEach(r => assert.ifError(r.erro));
  const quinto = executar(preparar(Readable.from([corpo(arquivo())]), 3, 'C'));
  assert.equal((await quinto.resultado).erro.statusCode, 429);
  assert.equal(resultados.filter(r => r.req.file?.buffer).length, 4);
  ops[0].finalizar();
  ops[0].finalizar();
  const reposicao = executar(preparar(Readable.from([corpo(arquivo())]), 1, 'A'));
  assert.ifError((await reposicao.resultado).erro);
  const sexto = executar(preparar(Readable.from([corpo(arquivo())]), 3, 'C'));
  assert.equal((await sexto.resultado).erro.statusCode, 429);
});
