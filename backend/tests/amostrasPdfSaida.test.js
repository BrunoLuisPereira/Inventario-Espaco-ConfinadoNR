const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { prepararFs: preparar } = require('./helpers/amostrasPdfFsSimulado.cjs');
const { criarSaidaSegura, resolverDestino, NOMES } = require('../scripts/amostrasPdfSaida.cjs');
const PDF = Buffer.from('%PDF-1.7\nAMOSTRA EXCLUSIVAMENTE SINTETICA\n%%EOF\n');
for (const [nome, caminhos, raiz] of [
  ['Linux', path.posix, '/tmp/nr33/amostras'],
  ['Windows', path.win32, 'C:\\nr33\\amostras'],
]) {
  test(`contenção lexical ${nome}: relativos, absolutos, prefixos e travessia`, () => {
    assert.equal(resolverDestino(raiz, 'lote', caminhos), caminhos.join(raiz, 'lote'));
    assert.equal(resolverDestino(raiz, caminhos.join(raiz, 'lote'), caminhos), caminhos.join(raiz, 'lote'));
    assert.equal(resolverDestino(raiz, '.', caminhos), raiz);
    for (const argumento of ['', ' ', '..', '../fora', 'lote/../outro', 'lote\\..\\fora',
      raiz + '-externo', caminhos.join(raiz + '-externo', 'lote'), 'arquivo\0.pdf',
      'C:relativo', 'D:\\fora', '\\\\servidor\\share\\pasta', '//servidor/share/pasta',
      '\\\\?\\C:\\nr33\\amostras', 'lote.', 'lote ', 'lote:stream']) {
      assert.throws(() => resolverDestino(raiz, argumento, caminhos), /não autorizado/, argumento);
    }
  });
}

test('cria subdiretórios, aceita absoluto interno e grava bytes sem transformação', async t => {
  const { raiz } = await preparar(t);
  const saida = await criarSaidaSegura(raiz, 'lote/subpasta');
  assert.equal(saida.destino, path.join(raiz, 'lote/subpasta'));
  await saida.escrever(NOMES[0], PDF);
  assert.deepEqual(await fs.readFile(path.join(saida.destino, NOMES[0])), PDF);
  const outra = await criarSaidaSegura(raiz, path.join(raiz, 'outro'));
  await outra.escrever(NOMES[1], PDF);
  assert.deepEqual(await fs.readFile(path.join(outra.destino, NOMES[1])), PDF);
});

test('recusa saída antes de criar diretórios externos', async t => {
  const { raiz, temporario } = await preparar(t);
  for (const argumento of ['../externo', raiz + '-externo', path.join(temporario, 'externo')]) {
    await assert.rejects(criarSaidaSegura(raiz, argumento), /não autorizado/);
  }
  assert.deepEqual(await fs.readdir(temporario), []);
});

for (const componente of ['ancestral', 'raiz', 'subdiretorio']) {
  for (const tipo of (process.platform === 'win32' ? ['junction', 'dir'] : ['dir'])) {
    test(`recusa link ${tipo} em ${componente} sem criar PDFs no destino externo`, async t => {
      const { raiz, temporario } = await preparar(t);
      const externo = path.join(temporario, 'externo');
      await fs.mkdir(externo);
      await fs.mkdir(raiz);
      const link = path.join(temporario, 'link');
      try { await fs.symlink(externo, link, tipo); }
      catch (erro) {
        if (process.platform === 'win32' && tipo === 'dir' && erro.code === 'EPERM') {
          t.skip('Windows exige privilégio de symlink; junction é testada separadamente.');
          return;
        }
        throw erro;
      }
      const base = componente === 'ancestral' ? path.join(link, 'amostras') : componente === 'raiz' ? link : raiz;
      const argumento = componente === 'subdiretorio' ? 'link/lote' : 'lote';
      if (componente === 'subdiretorio') await fs.symlink(externo, path.join(raiz, 'link'), tipo);
      await assert.rejects(criarSaidaSegura(base, argumento), /não autorizado/);
      assert.deepEqual(await fs.readdir(externo), []);
    });
  }
}

for (const indice of [0, 1]) {
  test(`colisão no PDF ${indice + 1} preserva arquivo existente e não cria o outro`, async t => {
    const { raiz } = await preparar(t);
    await fs.mkdir(raiz);
    await fs.writeFile(path.join(raiz, NOMES[indice]), PDF, { flag: 'wx' });
    await assert.rejects(criarSaidaSegura(raiz, '.'), { code: 'EEXIST' });
    assert.deepEqual(await fs.readFile(path.join(raiz, NOMES[indice])), PDF);
    assert.deepEqual(await fs.readdir(raiz), [NOMES[indice]]);
  });
}

test('wx protege contra colisão posterior à validação, sem sobrescrever', async t => {
  const { raiz } = await preparar(t);
  const saida = await criarSaidaSegura(raiz, '.');
  const arquivo = path.join(raiz, NOMES[0]);
  await fs.writeFile(arquivo, PDF, { flag: 'wx' });
  await assert.rejects(saida.escrever(NOMES[0], Buffer.from('NAO GRAVAR')), { code: 'EEXIST' });
  assert.deepEqual(await fs.readFile(arquivo), PDF);
  await assert.rejects(saida.escrever('../externo.pdf', PDF), /não autorizado/);
});

test('recusa link final de arquivo sem alterar PDF apontado', async t => {
  const { raiz, temporario } = await preparar(t);
  const saida = await criarSaidaSegura(raiz, '.');
  const externo = path.join(temporario, 'preservar.pdf');
  await fs.writeFile(externo, PDF, { flag: 'wx' });
  try { await fs.symlink(externo, path.join(raiz, NOMES[0]), 'file'); }
  catch (erro) {
    if (process.platform === 'win32' && erro.code === 'EPERM') {
      t.skip('Windows exige privilégio de symlink de arquivo.');
      return;
    }
    throw erro;
  }
  await assert.rejects(saida.escrever(NOMES[0], Buffer.from('NAO GRAVAR')), { code: 'EEXIST' });
  assert.deepEqual(await fs.readFile(externo), PDF);
});

test('revalida identidade dos diretórios antes de abrir arquivo', async t => {
  const { raiz } = await preparar(t);
  const saida = await criarSaidaSegura(raiz, '.');
  const original = fs.lstat;
  t.mock.method(fs, 'lstat', async (p, opcoes) => {
    const stat = await original(p, opcoes);
    if (p === raiz) stat.ino += 1n;
    return stat;
  });
  await assert.rejects(saida.escrever(NOMES[0], PDF), /não autorizado/);
  assert.deepEqual(await fs.readdir(raiz), []);
});

test('simulação não libera .env, uploads ou PDFs fora da raiz temporária própria', async t => {
  const { temporario } = await preparar(t);
  for (const p of [path.join(temporario, '.env.pdf'), path.join(temporario, 'uploads/arquivo.pdf'),
    path.join(path.dirname(temporario), 'nao-abrir-pdf-preexistente.pdf')]) {
    await assert.rejects(fs.readFile(p), e => /Arquivo real/.test(e.message) || e.code === 'ENOENT');
  }
});
