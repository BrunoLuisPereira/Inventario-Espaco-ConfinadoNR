const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const raiz = path.resolve(__dirname, "../../uploads");
const pdfs = path.join(raiz, "relatorios");
const fotos = path.join(raiz, "evidencias");
const erroArquivo = () => Object.assign(new Error("Arquivo indisponível."), { statusCode: 404 });
const igual = (a, b) => process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b;
function identidade(s) {
  if (s.dev == null || s.ino == null) throw erroArquivo();
  return `${s.dev}:${s.ino}`;
}
function versao(s) { return `${identidade(s)}:${s.size}:${s.mtimeNs ?? s.mtimeMs}:${s.ctimeNs ?? s.ctimeMs}`; }
async function diretorios(base, esperados) {
  const ids = [];
  for (const p of [raiz, base]) {
    const s = await fs.promises.lstat(p, { bigint: true });
    if (s.isSymbolicLink() || !s.isDirectory() || !igual(await fs.promises.realpath(p), p)) throw erroArquivo();
    ids.push(identidade(s));
  }
  if (esperados && ids.some((id, i) => id !== esperados[i])) throw erroArquivo();
  return ids;
}
async function verificar(handle, destino, base, pastas) {
  await diretorios(base, pastas);
  const aberto = await handle.stat({ bigint: true });
  const atual = await fs.promises.lstat(destino, { bigint: true });
  if (!aberto.isFile() || !atual.isFile() || atual.isSymbolicLink() ||
    String(aberto.nlink) !== "1" || String(atual.nlink) !== "1" ||
    identidade(aberto) !== identidade(atual) || !igual(await fs.promises.realpath(destino), destino)) throw erroArquivo();
  return aberto;
}
function caminho(base, salvo) {
  if (typeof salvo !== "string" || !salvo || salvo.includes("\0") || salvo.includes(":")) throw erroArquivo();
  const destino = path.resolve(__dirname, "../../", salvo);
  const relativo = path.relative(base, destino);
  if (!relativo || relativo === ".." || relativo.startsWith(`..${path.sep}`) || path.isAbsolute(relativo) || path.dirname(relativo) !== ".") throw erroArquivo();
  return destino;
}
async function ler(base, salvo) {
  const destino = caminho(base, salvo);
  const pastas = await diretorios(base);
  const handle = await fs.promises.open(destino, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
  try {
    const antes = await verificar(handle, destino, base, pastas);
    const buffer = await handle.readFile();
    const depois = await verificar(handle, destino, base, pastas);
    if (versao(antes) !== versao(depois) || BigInt(buffer.length) !== BigInt(depois.size)) throw erroArquivo();
    return { buffer, modificado: new Date(Number(depois.mtimeMs)) };
  } finally { await handle.close(); }
}
function contexto(usuario, id) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(usuario?.id_ambiente) || !Number.isSafeInteger(id) || id <= 0) throw erroArquivo();
}
async function lerPdf(relatorio, usuario) {
  contexto(usuario, relatorio.id_relatorio);
  const nome = path.basename(relatorio.caminho_pdf || "");
  const prefixo = `relatorio-${relatorio.id_relatorio}-`;
  const novo = `${prefixo}${usuario.id_ambiente}_`;
  const legado = new RegExp(`^relatorio-${relatorio.id_relatorio}-[0-9]+\\.pdf$`);
  if (!(legado.test(nome) || nome.startsWith(novo) && /^[0-9a-f-]{36}\.pdf$/i.test(nome.slice(novo.length))) || !/^[a-f0-9]{64}$/i.test(relatorio.hash_pdf || "")) throw erroArquivo();
  const resultado = await ler(pdfs, relatorio.caminho_pdf);
  if (resultado.buffer.subarray(0, 5).toString() !== "%PDF-" ||
    crypto.createHash("sha256").update(resultado.buffer).digest("hex") !== relatorio.hash_pdf.toLowerCase()) throw erroArquivo();
  return resultado;
}
async function lerFoto(evidencia, usuario, idLocal) {
  contexto(usuario, idLocal);
  if (evidencia.tipo !== "FOTO" || !evidencia.caminho_arquivo) return null;
  const nome = path.basename(evidencia.caminho_arquivo);
  const prefixo = `${usuario.id_ambiente}_${idLocal}_`;
  if (!nome.startsWith(prefixo) || !/^[0-9a-f-]{36}\.(?:jpg|png)$/i.test(nome.slice(prefixo.length))) {
    // Política autorizada: mantém legenda/GPS; não lê foto sem vínculo físico.
    return null;
  }
  try { return (await ler(fotos, evidencia.caminho_arquivo)).buffer; }
  catch (falha) { if (falha.code === "ENOENT" || falha.statusCode === 404) return null; throw falha; }
}
async function persistirPdf(buffer, usuario, idRelatorio) {
  contexto(usuario, idRelatorio);
  if (!Buffer.isBuffer(buffer) || buffer.subarray(0, 5).toString() !== "%PDF-") throw new Error("PDF inválido.");
  // Cria somente a pasta final quando ausente, depois de validar uploads.
  // Não segue junctions nem reorganiza diretórios ou documentos existentes.
  const raizStat = await fs.promises.lstat(raiz, { bigint: true });
  if (raizStat.isSymbolicLink() || !raizStat.isDirectory() || !igual(await fs.promises.realpath(raiz), raiz)) throw erroArquivo();
  try { await fs.promises.mkdir(pdfs, { mode: 0o700 }); }
  catch (falha) { if (falha.code !== "EEXIST") throw falha; }
  const raizDepois = await fs.promises.lstat(raiz, { bigint: true });
  if (identidade(raizStat) !== identidade(raizDepois)) throw erroArquivo();
  const pastas = await diretorios(pdfs);
  const nome = `relatorio-${idRelatorio}-${usuario.id_ambiente}_${crypto.randomUUID()}.pdf`;
  const destino = path.join(pdfs, nome);
  const handle = await fs.promises.open(destino, "wx", 0o600);
  try {
    await verificar(handle, destino, pdfs, pastas);
    await handle.writeFile(buffer); await handle.sync();
    const stat = await verificar(handle, destino, pdfs, pastas);
    if (BigInt(stat.size) !== BigInt(buffer.length)) throw erroArquivo();
  } finally { await handle.close(); }
  // Não faz unlink após falha: o nome pode ter sido substituído/associado.
  return { caminhoRelativo: `uploads/relatorios/${nome}`, hash: crypto.createHash("sha256").update(buffer).digest("hex") };
}
module.exports = { persistirPdf, lerPdf, lerFoto };
