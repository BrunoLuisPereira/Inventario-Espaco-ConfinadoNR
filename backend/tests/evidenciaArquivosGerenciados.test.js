const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const { Readable } = require('node:stream');
const JPEG = Buffer.from([255, 216, 255, 224, 0, 0, 255, 217]);
const PNG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130]);
const PDF = Buffer.from('%PDF-1.7\nFICTICIO\n%%EOF\n');
const usuario = { id_usuario: 11, id_ambiente: '11111111-1111-4111-8111-111111111111' };
function carregar(t, opcoes = {}) {
  const alvo = require.resolve('../src/utils/evidenciaArquivoUtils');
  const anterior = require.cache[alvo];
  const original = Module._load;
  const eventos = [];
  const raiz = path.resolve(__dirname, '../uploads/evidencias');
  let abriu = false;
  let escreveu = false;
  const fs = { promises: {
    async lstat(p) {
      eventos.push(['lstat', p]);
      const arquivo = p !== raiz && p !== path.dirname(raiz);
      return { dev: 1n, ino: arquivo ? (opcoes.trocaArquivo && abriu ? 99n : 4n) :
        (opcoes.trocaPasta && abriu ? 99n : p === raiz ? 3n : 2n),
        nlink: opcoes.compartilhado && arquivo ? 2n : 1n,
        isSymbolicLink: () => !!opcoes.link || (!!opcoes.linkArquivo && arquivo),
        isDirectory: () => !arquivo, isFile: () => arquivo };
    },
    async realpath(p) {
      if (opcoes.fora || (opcoes.junction && abriu) || (opcoes.trocaDepois && escreveu)) return path.resolve(raiz, '../externo');
      return p;
    },
    async open(p, flag, modo) {
      eventos.push(['open', p, flag, modo]);
      if (opcoes.colisao) throw Object.assign(new Error('colisão'), { code: 'EEXIST' });
      abriu = true;
      return {
        async stat() { return { dev: 1n, ino: 4n, nlink: 1n, isFile: () => true }; },
        async writeFile(b) { eventos.push(['write', b]); escreveu = true; if (opcoes.falha) throw new Error('falha de escrita'); },
        async sync() { eventos.push(['sync']); if (opcoes.falhaSync) throw new Error('falha ao sincronizar'); },
        async close() { eventos.push(['close']); if (opcoes.falhaClose) throw new Error('falha ao fechar'); },
      };
    },
    async unlink() { eventos.push(['unlink']); throw new Error('Nenhum unlink permitido'); },
  } };
  let utils;
  try {
    delete require.cache[alvo];
    Module._load = function (request, parent, ...args) {
      if (parent?.filename === alvo) {
        if (request === 'fs') return fs;
        if (request === 'path') return path;
        if (request === 'crypto') return { randomUUID: () => '33333333-3333-4333-8333-333333333333' };
        throw new Error('Dependência inesperada');
      }
      return original.call(this, request, parent, ...args);
    };
    utils = require(alvo);
  } finally {
    Module._load = original;
    if (anterior) require.cache[alvo] = anterior; else delete require.cache[alvo];
  }
  t.after(() => assert.equal(eventos.some((e) => e[0] === 'unlink'), false));
  return { utils, eventos, raiz };
}
for (const [nome, mimetype, buffer, tipo] of [['foto.jpeg', 'image/jpeg', JPEG, 'FOTO'], ['foto.PNG', 'image/png', PNG, 'FOTO'], ['arquivo.pdf', 'application/pdf', PDF, 'DOCUMENTO']]) {
  test('Valida assinatura, extensão e MIME de ' + nome, (t) => {
    const { utils, eventos } = carregar(t);
    assert.equal(utils.validarUpload({ originalname: nome, mimetype, buffer }).tipo, tipo);
    assert.deepEqual(eventos, []);
  });
}
for (const [nome, mimetype, buffer] of [['foto.jpg', 'image/jpeg', Buffer.from('texto')], ['foto.exe', 'image/jpeg', JPEG], ['foto.png', 'image/png', JPEG], ['arquivo.pdf', 'application/pdf', Buffer.from('%PDF-1.7\nsem fim')], ['foto.jpg', 'image/jpeg', Buffer.alloc(0)], ['foto.jpg', 'image/jpeg', Buffer.alloc(10 * 1024 * 1024 + 1)]]) {
  test('Rejeita arquivo incompatível ' + nome + '/' + buffer.length, (t) => {
    const { utils, eventos } = carregar(t);
    assert.throws(() => utils.validarUpload({ originalname: nome, mimetype, buffer }), { statusCode: 400 });
    assert.deepEqual(eventos, []);
  });
}
test('Grava exclusivamente arquivo novo com identidade no nome e permissão restrita', async (t) => {
  const { utils, eventos, raiz } = carregar(t);
  const registro = await utils.persistirUploadAutorizado({ originalname: '../../nome-do-cliente.jpg', mimetype: 'image/jpeg', buffer: JPEG }, usuario, 10);
  assert.equal(registro.caminho_arquivo, 'uploads/evidencias/' + usuario.id_ambiente + '_10_33333333-3333-4333-8333-333333333333.jpg');
  const abrir = eventos.find((e) => e[0] === 'open');
  assert.equal(path.dirname(abrir[1]), raiz);
  assert.deepEqual(abrir.slice(2), ['wx', 0o600]);
  assert.strictEqual(eventos.find((e) => e[0] === 'write')[1], JPEG);
  assert.equal(eventos.filter((e) => e[0] === 'close').length, 1);
  assert.ok(eventos.findIndex((e) => e[0] === 'write') < eventos.findIndex((e) => e[0] === 'sync'));
});
for (const opcoes of [{ link: true }, { fora: true }, { colisao: true }, { falha: true }]) {
  test('Falha segura em armazenamento simulado ' + JSON.stringify(opcoes), async (t) => {
    const { utils, eventos } = carregar(t, opcoes);
    await assert.rejects(utils.persistirUploadAutorizado({ originalname: 'foto.jpg', mimetype: 'image/jpeg', buffer: JPEG }, usuario, 10));
    if (opcoes.link || opcoes.fora) assert.equal(eventos.some((e) => e[0] === 'open'), false);
    if (opcoes.falha) assert.equal(eventos.filter((e) => e[0] === 'close').length, 1);
  });
}

for (const opcoes of [{ trocaPasta: true }, { trocaArquivo: true }, { junction: true }, { linkArquivo: true }, { compartilhado: true }]) {
  test('Não escreve após troca/link simulado: ' + JSON.stringify(opcoes), async (t) => {
    const { utils, eventos } = carregar(t, opcoes);
    await assert.rejects(utils.persistirUploadAutorizado({ originalname: 'foto.jpg', mimetype: 'image/jpeg', buffer: JPEG }, usuario, 10));
    assert.equal(eventos.some((e) => e[0] === 'write'), false);
    assert.equal(eventos.filter((e) => e[0] === 'close').length, 1);
  });
}
for (const opcoes of [{ trocaDepois: true }, { falhaSync: true }, { falhaClose: true }]) {
  test('Não retorna associação após falha/troca pós-escrita: ' + JSON.stringify(opcoes), async (t) => {
    const { utils, eventos } = carregar(t, opcoes);
    await assert.rejects(utils.persistirUploadAutorizado({ originalname: 'foto.jpg', mimetype: 'image/jpeg', buffer: JPEG }, usuario, 10));
    assert.equal(eventos.filter((e) => e[0] === 'write').length, 1);
    assert.equal(eventos.filter((e) => e[0] === 'close').length, 1);
  });
}
test('Falha de close não substitui a falha original de gravação', async (t) => {
  const { utils } = carregar(t, { falha: true, falhaClose: true });
  await assert.rejects(utils.persistirUploadAutorizado({ originalname: 'foto.jpg', mimetype: 'image/jpeg', buffer: JPEG }, usuario, 10), { message: 'falha de escrita' });
});
for (const caminho of ['../../fora.jpg', 'uploads/evidencias/../../fora.jpg', 'uploads/evidencias', 'uploads/evidencias/foto\0.jpg', 123, {}]) {
  test('Resolvedor rejeita caminho inseguro sem filesystem: ' + JSON.stringify(caminho), (t) => {
    const { utils, eventos } = carregar(t);
    t.mock.method(console, 'error', () => {});
    assert.equal(utils.obterCaminhoCompleto(caminho), null);
    assert.deepEqual(eventos, []);
  });
}
test('Resolvedor mantém referência legada comum sem renomear nem excluir', (t) => {
  const { utils, eventos, raiz } = carregar(t);
  assert.equal(utils.obterCaminhoCompleto('uploads/evidencias/foto-legada.jpg'), path.join(raiz, 'foto-legada.jpg'));
  assert.deepEqual(eventos, []);
});

async function receberMultipart(buffer, mimetype = 'image/jpeg') {
  const { uploadEvidencia } = require('../src/middlewares/uploadEvidenciaMiddleware');
  const boundary = 'BOUNDARY_FICTICIO_EVIDENCIAS';
  const corpo = Buffer.concat([
    Buffer.from('--' + boundary + '\r\nContent-Disposition: form-data; name="id_local"\r\n\r\n10\r\n--' + boundary + '\r\nContent-Disposition: form-data; name="arquivo"; filename="foto.jpg"\r\nContent-Type: ' + mimetype + '\r\n\r\n'),
    buffer, Buffer.from('\r\n--' + boundary + '--\r\n'),
  ]);
  const req = Readable.from([corpo]);
  req.headers = { 'content-type': 'multipart/form-data; boundary=' + boundary, 'content-length': String(corpo.length) };
  await new Promise((resolve, reject) => uploadEvidencia.single('arquivo')(req, {}, (erro) => erro ? reject(erro) : resolve()));
  return req;
}
test('Multer real recebe multipart em memória sem caminho físico', async () => {
  const req = await receberMultipart(JPEG);
  assert.deepEqual(req.file.buffer, JPEG);
  assert.equal(req.file.path, undefined);
  assert.equal(req.file.destination, undefined);
  assert.equal(req.body.id_local, '10');
});
test('Multer real mantém limite de 10 MiB', async () => {
  await assert.rejects(receberMultipart(Buffer.alloc(10 * 1024 * 1024 + 1)), { code: 'LIMIT_FILE_SIZE' });
});
test('Multer real rejeita MIME não permitido sem filesystem', async () => {
  await assert.rejects(receberMultipart(Buffer.from('FICTICIO'), 'application/octet-stream'), { statusCode: 400 });
});
