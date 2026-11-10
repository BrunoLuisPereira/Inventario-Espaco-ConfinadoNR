const fs = require('node:fs/promises');
const path = require('node:path');

const NOMES = Object.freeze(['nr33-corporativo-sintetico.pdf', 'nr33-corporativo-extenso.pdf']);
const rejeitar = () => { throw new Error('Diretório de amostras não autorizado.'); };
function contido(raiz, destino, caminhos) {
  const relativo = caminhos.relative(raiz, destino);
  return relativo !== '..' && !relativo.startsWith('..' + caminhos.sep) && !caminhos.isAbsolute(relativo);
}

function resolverDestino(raiz, argumento, caminhos = path) {
  if (typeof argumento !== 'string' || !argumento.trim() || /[\x00-\x1f]/.test(argumento)) rejeitar();
  // Verifica ambas as sintaxes mesmo em Linux. Evita ADS, unidades relativas,
  // caminhos de dispositivo, UNC e nomes ambíguos normalizados pelo Windows.
  const partes = argumento.split(/[\\/]/);
  if (partes.some(p => p === '..' || (p && p !== '.' && /[ .]$/.test(p)))) rejeitar();
  if (/^[\\/]{2}/.test(argumento) || /^\\/.test(argumento)) rejeitar();
  if (caminhos.sep !== '\\' && (argumento.includes('\\') || argumento.includes(':'))) rejeitar();
  if (caminhos.sep === '\\' && argumento.includes(':') && !/^[a-z]:[\\/]/i.test(argumento)) rejeitar();
  if (caminhos.sep === '\\' && argumento.slice(2).includes(':')) rejeitar();
  const base = caminhos.resolve(raiz);
  const destino = caminhos.isAbsolute(argumento) ? caminhos.resolve(argumento) : caminhos.resolve(base, argumento);
  if (!contido(base, destino, caminhos)) rejeitar();
  return destino;
}

async function criarSaidaSegura(raiz, argumento) {
  const base = path.resolve(raiz);
  const destino = resolverDestino(base, argumento);
  const identidades = [];
  async function registrar(diretorio, criar) {
    let stat;
    try { stat = await fs.lstat(diretorio, { bigint: true }); }
    catch (erro) {
      if (erro.code !== 'ENOENT' || !criar) throw erro;
      // Sem recursive: o pai já foi verificado, inclusive acima da raiz.
      try { await fs.mkdir(diretorio, { mode: 0o700 }); }
      catch (e) { if (e.code !== 'EEXIST') throw e; }
      stat = await fs.lstat(diretorio, { bigint: true });
    }
    if (stat.isSymbolicLink() || !stat.isDirectory()) rejeitar();
    identidades.push({ diretorio, dev: stat.dev, ino: stat.ino, real: await fs.realpath(diretorio) });
  }
  async function conferir() {
    for (const anterior of identidades) {
      const atual = await fs.lstat(anterior.diretorio, { bigint: true });
      if (atual.isSymbolicLink() || !atual.isDirectory() || atual.dev !== anterior.dev || atual.ino !== anterior.ino ||
          await fs.realpath(anterior.diretorio) !== anterior.real) rejeitar();
    }
  }
  const ancora = path.parse(destino).root;
  await registrar(ancora, false);
  let atual = ancora;
  for (const parte of destino.slice(ancora.length).split(path.sep).filter(Boolean)) {
    await conferir();
    atual = path.join(atual, parte);
    await registrar(atual, true);
  }
  await conferir();
  const baseReal = await fs.realpath(base);
  if (!contido(baseReal, await fs.realpath(destino), path)) rejeitar();
  // Recusa colisões antes de gerar PDFs; wx continua protegendo contra corridas.
  for (const nome of NOMES) {
    try { await fs.lstat(path.join(destino, nome)); }
    catch (erro) { if (erro.code === 'ENOENT') continue; throw erro; }
    throw Object.assign(new Error('Amostra já existente; nenhum arquivo será sobrescrito.'), { code: 'EEXIST' });
  }
  return {
    destino,
    async escrever(nome, buffer) {
      if (!NOMES.includes(nome)) rejeitar();
      await conferir();
      const arquivo = await fs.open(path.join(destino, nome), 'wx', 0o600);
      try {
        await conferir();
        const stat = await arquivo.stat({ bigint: true });
        if (!stat.isFile() || stat.nlink !== 1n) rejeitar();
        await arquivo.writeFile(buffer);
        await arquivo.sync();
        await conferir();
      } finally { await arquivo.close(); }
    },
  };
}

module.exports = { criarSaidaSegura, resolverDestino, NOMES };
