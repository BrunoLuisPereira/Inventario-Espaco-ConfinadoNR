const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');

// Diretórios e links reais; conteúdo PDF exclusivamente em memória. Não captura
// funções anteriores ao preload e não abre exceções no bloqueio de arquivos reais.
async function prepararFs(t) {
  const temporario = await fs.mkdtemp(path.join(os.tmpdir(), 'nr33-pdf-simulado-'));
  const identidade = await fs.lstat(temporario, { bigint: true });
  const arquivos = new Map();
  const links = new Set();
  const symlinkOriginal = fs.symlink;
  const original = Object.fromEntries(['lstat', 'open', 'writeFile', 'readFile', 'readdir'].map(n => [n, fs[n]]));
  const dentro = p => {
    if (typeof p !== 'string') return false;
    const relativo = path.relative(temporario, path.resolve(p));
    return relativo && relativo !== '..' && !relativo.startsWith('..' + path.sep) && !path.isAbsolute(relativo);
  };
  const simulado = p => dentro(p) && /\.pdf$/i.test(p) && !/(?:^|[\\/])(?:\.env(?:\.|$)|uploads(?:[\\/]|$))/i.test(p);
  const erro = code => Object.assign(new Error('Arquivo simulado: ' + code), { code });
  const stat = link => ({ dev: 1n, ino: 1n, nlink: 1n, isFile: () => !link, isSymbolicLink: () => link, isDirectory: () => false });
  async function link(p) {
    if (links.has(p)) return true;
    try { await fs.readlink(p); return true; }
    catch (e) { if (['ENOENT', 'EINVAL', 'UNKNOWN'].includes(e.code)) return false; throw e; }
  }
  t.mock.method(fs, 'symlink', async (alvo, p, tipo) => {
    if (!simulado(p)) return symlinkOriginal(alvo, p, tipo);
    if (arquivos.has(p) || links.has(p)) throw erro('EEXIST');
    links.add(p);
  });
  t.mock.method(fs, 'lstat', async (p, ...args) => {
    if (!simulado(p)) return original.lstat(p, ...args);
    if (await link(p)) return stat(true);
    if (!arquivos.has(p)) throw erro('ENOENT');
    return stat(false);
  });
  t.mock.method(fs, 'open', async (p, flags, mode) => {
    if (!simulado(p)) return original.open(p, flags, mode);
    assert.equal(flags, 'wx');
    assert.equal(mode, 0o600);
    if (arquivos.has(p) || await link(p)) throw erro('EEXIST');
    arquivos.set(p, Buffer.alloc(0));
    return { stat: async () => stat(false), writeFile: async b => arquivos.set(p, Buffer.from(b)), sync: async () => {}, close: async () => {} };
  });
  t.mock.method(fs, 'writeFile', async (p, b, options) => {
    if (!simulado(p)) return original.writeFile(p, b, options);
    assert.equal(options?.flag, 'wx');
    if (arquivos.has(p) || await link(p)) throw erro('EEXIST');
    arquivos.set(p, Buffer.from(b));
  });
  t.mock.method(fs, 'readFile', async (p, ...args) => {
    if (!simulado(p)) return original.readFile(p, ...args);
    if (!arquivos.has(p)) throw erro('ENOENT');
    return Buffer.from(arquivos.get(p));
  });
  t.mock.method(fs, 'readdir', async (p, ...args) => {
    const nomes = await original.readdir(p, ...args);
    if (p !== temporario && !dentro(p)) return nomes;
    return [...new Set([...nomes, ...[...arquivos.keys(), ...links].filter(a => path.dirname(a) === p).map(a => path.basename(a))])];
  });
  t.after(async () => {
    // Somente a raiz recém-criada, com identidade preservada. rm não segue links.
    const atual = await original.lstat(temporario, { bigint: true });
    assert.ok(!atual.isSymbolicLink() && atual.dev === identidade.dev && atual.ino === identidade.ino);
    assert.equal(path.dirname(temporario), path.resolve(os.tmpdir()));
    assert.ok(path.basename(temporario).startsWith('nr33-pdf-simulado-'));
    await fs.rm(temporario, { recursive: true });
    arquivos.clear();
  });
  return { temporario, raiz: path.join(temporario, 'autorizado') };
}

module.exports = { prepararFs };
