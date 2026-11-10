const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { prepararFs } = require('./helpers/amostrasPdfFsSimulado.cjs');
const Module = require('node:module');
const { criarSaidaSegura, NOMES } = require('../scripts/amostrasPdfSaida.cjs');

test('gerador real preserva os dois buffers PDF e recusa repetição sem alterar amostras', async t => {
  const { temporario } = await prepararFs(t);
  const raizTeste = path.join(temporario, 'amostras');
  const alvo = require.resolve('../scripts/gerar-amostra-pdf-nr33.cjs');
  const anterior = require.cache[alvo];
  delete require.cache[alvo];
  t.after(() => { if (anterior) require.cache[alvo] = anterior; else delete require.cache[alvo]; });
  const load = Module._load;
  const buffers = new Map();
  t.mock.method(console, 'log', () => {});
  t.mock.method(Module, '_load', function (nome, parent, ...args) {
    assert.ok(!/config[\\/]database|dotenv/.test(nome), 'Configuração real proibida');
    assert.notEqual(nome, 'pg', 'Banco real proibido');
    if (parent?.filename === alvo && nome === './amostrasPdfSaida.cjs') return {
      async criarSaidaSegura(raiz, argumento) {
        assert.equal(raiz, path.resolve(__dirname, '../../artifacts/amostras-pdf-nr33'));
        const saida = await criarSaidaSegura(raizTeste, argumento);
        return { destino: saida.destino, async escrever(nome, buffer) {
          assert.ok(buffer.subarray(0, 5).equals(Buffer.from('%PDF-')));
          buffers.set(nome, Buffer.from(buffer));
          await saida.escrever(nome, buffer);
        } };
      },
    };
    return load.call(this, nome, parent, ...args);
  });
  const { main } = require(alvo);
  await assert.rejects(main(''), /Informe um subdiretório/);
  await assert.rejects(main('../externo'), /não autorizado/);
  await main('lote');
  const pasta = path.join(raizTeste, 'lote');
  assert.deepEqual((await fs.readdir(pasta)).sort(), [...NOMES].sort());
  for (const nome of NOMES) assert.deepEqual(await fs.readFile(path.join(pasta, nome)), buffers.get(nome));
  await assert.rejects(main('lote'), { code: 'EEXIST' });
  for (const nome of NOMES) assert.deepEqual(await fs.readFile(path.join(pasta, nome)), buffers.get(nome));
});
