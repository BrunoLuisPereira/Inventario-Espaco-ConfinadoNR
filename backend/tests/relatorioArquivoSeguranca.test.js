const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const crypto = require('node:crypto');
const Module = require('node:module');
const fs = require('node:fs');
const fonte = require.resolve('../src/utils/relatorioArquivoUtils');
const raiz = path.resolve(__dirname, '../uploads');
const pdfs = path.join(raiz, 'relatorios');
const fotos = path.join(raiz, 'evidencias');
const usuario = { id_ambiente: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' };
const uuid = '11111111-1111-4111-8111-111111111111';
const nome = `relatorio-7-${usuario.id_ambiente}_${uuid}.pdf`;
const bytes = Buffer.from('%PDF-1.7\nconteudo simulado\n%%EOF');
const falha = code => Object.assign(new Error('SEGREDO /interno senha=privada'), { code });
function stat(ino, tamanho = bytes.length, tipo = 'arquivo', links = 1) {
  return { dev: 1n, ino: BigInt(ino), nlink: BigInt(links), size: BigInt(tamanho),
    mtimeMs: 1000n, mtimeNs: 1000000000n, ctimeNs: 1000000000n,
    isFile: () => tipo === 'arquivo', isDirectory: () => tipo === 'pasta', isSymbolicLink: () => tipo === 'link' };
}
function simular(t, modo = {}) {
  const chamadas = []; let conteudo = Buffer.from(bytes); let lido = false; let escrito = false;
  let destino; let fechado = 0;
  const handle = {
    async stat() { return stat(3, escrito ? conteudo.length : bytes.length); },
    async readFile() { chamadas.push('read'); lido = true; if (modo.leitura) throw falha('EACCES'); return Buffer.from(conteudo); },
    async writeFile(b) { chamadas.push('write'); if (modo.gravacao) throw falha('ENOSPC'); escrito = true; conteudo = Buffer.from(b); },
    async sync() { chamadas.push('sync'); if (modo.sync) throw falha('EIO'); },
    async close() { chamadas.push('close'); fechado++; }
  };
  const falsoFs = { constants: fs.constants, promises: {
    async mkdir(p, opcoes) { chamadas.push('mkdir'); assert.equal(p, pdfs); assert.deepEqual(opcoes, { mode: 0o700 }); if (!modo.pastaAusente) throw falha('EEXIST'); },
    async lstat(p) {
      chamadas.push(['lstat', p]);
      if (p === raiz) return stat(modo.trocaRaiz && lido ? 9 : 1, 0, modo.linkRaiz ? 'link' : 'pasta');
      if (p === pdfs || p === fotos) return stat(modo.trocaPasta && lido ? 8 : 2, 0, modo.linkPasta ? 'link' : 'pasta');
      assert.equal(p, destino, 'nenhum caminho não previsto pode ser acessado');
      return stat(modo.trocaArquivo && lido ? 4 : 3, conteudo.length, modo.linkArquivo ? 'link' : 'arquivo', modo.compartilhado ? 2 : 1);
    },
    async realpath(p) { chamadas.push(['realpath', p]); return modo.escape && p === destino ? path.join(raiz, '..', 'externo.pdf') : p; },
    async open(p, flags, permissoes) {
      chamadas.push(['open', p, flags, permissoes]); destino = p;
      if (modo.abertura) throw falha(modo.abertura);
      assert.equal(path.dirname(p), modo.foto ? fotos : pdfs);
      return handle;
    }
  }};
  const carregar = Module._load;
  Module._load = function (r, parent, ...resto) {
    if (parent?.filename === fonte && r === 'fs') return falsoFs;
    if (parent?.filename === fonte && r === 'crypto') return { ...crypto, randomUUID: () => uuid };
    return carregar.call(this, r, parent, ...resto);
  };
  delete require.cache[fonte]; let utils;
  try { utils = require(fonte); } finally { Module._load = carregar; }
  t.after(() => { delete require.cache[fonte]; assert.ok(!chamadas.some(c => ['unlink', 'rename', 'delete'].includes(c))); });
  const registro = { id_relatorio: 7, caminho_pdf: `uploads/relatorios/${nome}`, hash_pdf: crypto.createHash('sha256').update(bytes).digest('hex') };
  return { utils, registro, chamadas, fechado: () => fechado };
}
test('PDF gerenciado: leitura pelo descritor, hash e fechamento', async t => {
  const s = simular(t); const r = await s.utils.lerPdf(s.registro, usuario);
  assert.deepEqual(r.buffer, bytes); assert.equal(s.fechado(), 1);
  assert.equal(s.chamadas.filter(c => Array.isArray(c) && c[0] === 'open').length, 1);
});
test('PDF legado com ID e hash válidos permanece disponível', async t => {
  const s = simular(t); s.registro.caminho_pdf = 'uploads/relatorios/relatorio-7-123456789.pdf';
  assert.deepEqual((await s.utils.lerPdf(s.registro, usuario)).buffer, bytes);
});
for (const [rotulo, modo] of Object.entries({ symlinkRaiz: { linkRaiz: true }, junctionPasta: { linkPasta: true },
  symlinkArquivo: { linkArquivo: true }, hardlink: { compartilhado: true }, realpathExterno: { escape: true },
  trocaArquivo: { trocaArquivo: true }, trocaDiretorio: { trocaPasta: true }, trocaUploads: { trocaRaiz: true } })) {
  test(`rejeita ${rotulo}, sem excluir arquivo`, async t => {
    const s = simular(t, modo); await assert.rejects(s.utils.lerPdf(s.registro, usuario), { statusCode: 404 });
    assert.equal(s.fechado(), modo.linkRaiz || modo.linkPasta ? 0 : 1);
  });
}
for (const caminho of ['../relatorios/' + nome, '/externo/' + nome, 'uploads/relatorios/sub/' + nome,
  'uploads/evidencias/' + nome, 'C:\\externo\\' + nome, 'uploads/relatorios/' + nome + '\0']) {
  test(`recusa caminho não permitido ${JSON.stringify(caminho)}`, async t => {
    const s = simular(t); s.registro.caminho_pdf = caminho;
    await assert.rejects(s.utils.lerPdf(s.registro, usuario), { statusCode: 404 }); assert.equal(s.chamadas.length, 0);
  });
}
for (const campo of ['hash', 'id', 'ambiente']) test(`não lê PDF com ${campo} incompatível`, async t => {
  const s = simular(t);
  if (campo === 'hash') s.registro.hash_pdf = null;
  if (campo === 'id') s.registro.id_relatorio = 8;
  const u = campo === 'ambiente' ? { id_ambiente: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' } : usuario;
  await assert.rejects(s.utils.lerPdf(s.registro, u), { statusCode: 404 }); assert.equal(s.chamadas.length, 0);
});
test('hash divergente não entrega o buffer', async t => {
  const s = simular(t); s.registro.hash_pdf = '0'.repeat(64);
  await assert.rejects(s.utils.lerPdf(s.registro, usuario), { statusCode: 404 }); assert.equal(s.fechado(), 1);
});
test('foto legada preservada: indisponível sem qualquer acesso físico', async t => {
  const s = simular(t); assert.equal(await s.utils.lerFoto({ tipo: 'FOTO', caminho_arquivo: 'uploads/evidencias/foto-antiga.jpg' }, usuario, 40), null);
  assert.equal(s.chamadas.length, 0);
});
test('foto gerenciada exige o mesmo ambiente e local', async t => {
  const s = simular(t, { foto: true }); const e = { tipo: 'FOTO', caminho_arquivo: `uploads/evidencias/${usuario.id_ambiente}_40_${uuid}.png` };
  assert.equal(await s.utils.lerFoto(e, usuario, 41), null); assert.equal(s.chamadas.length, 0);
  assert.deepEqual(await s.utils.lerFoto(e, usuario, 40), bytes);
});
test('foto gerenciada insegura não é incorporada', async t => {
  const s = simular(t, { foto: true, linkArquivo: true });
  assert.equal(await s.utils.lerFoto({ tipo: 'FOTO', caminho_arquivo: `uploads/evidencias/${usuario.id_ambiente}_40_${uuid}.jpg` }, usuario, 40), null);
  assert.equal(s.fechado(), 1);
});
for (const pastaAusente of [false, true]) test(`persistência exclusiva, diretório ${pastaAusente ? 'novo' : 'existente'}`, async t => {
  const s = simular(t, { pastaAusente }); const r = await s.utils.persistirPdf(bytes, usuario, 7);
  assert.equal(r.caminhoRelativo, `uploads/relatorios/${nome}`); assert.equal(r.hash, s.registro.hash_pdf);
  const open = s.chamadas.find(c => Array.isArray(c) && c[0] === 'open'); assert.equal(open[2], 'wx'); assert.equal(open[3], 0o600);
  assert.ok(s.chamadas.indexOf('write') < s.chamadas.indexOf('sync')); assert.equal(s.fechado(), 1);
});
for (const [rotulo, modo, code] of [['colisão', { abertura: 'EEXIST' }, 'EEXIST'], ['gravação', { gravacao: true }, 'ENOSPC'],
  ['fsync', { sync: true }, 'EIO'], ['leitura', { leitura: true }, 'EACCES']]) {
  test(`falha de ${rotulo} propaga e não exclui arquivo`, async t => {
    const s = simular(t, modo);
    await assert.rejects(rotulo === 'leitura' ? s.utils.lerPdf(s.registro, usuario) : s.utils.persistirPdf(bytes, usuario, 7), { code });
    assert.equal(s.fechado(), modo.abertura ? 0 : 1);
  });
}
