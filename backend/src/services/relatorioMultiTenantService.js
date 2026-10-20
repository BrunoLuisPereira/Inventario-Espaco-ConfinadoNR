const repository = require("../repositories/relatorioMultiTenantRepository");
const pdfService = require("./pdfService");
const arquivos = require("../utils/relatorioArquivoUtils");
const normalizarIdDominio = require("../utils/normalizarIdDominio");
const erro = (message, statusCode) => Object.assign(new Error(message), { statusCode });
function idValido(valor, nome = "ID do relatório", statusCode = 400) {
  try { return normalizarIdDominio(valor); }
  catch { throw erro(`${nome} inválido.`, statusCode); }
}
function identidade(u) {
  if (!u || typeof u !== "object" || Array.isArray(u) || typeof u.id_ambiente !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(u.id_ambiente)) throw erro("Usuário autenticado inválido.", 401);
  return { id_usuario: idValido(u.id_usuario, "Usuário", 401), id_ambiente: u.id_ambiente };
}
function campos(dados, criar) {
  if (!dados || typeof dados !== "object" || Array.isArray(dados)) throw erro("Dados do relatório inválidos.", 400);
  const r = {};
  for (const campo of ["nome_responsavel_tecnico", "crea", "numero_art", "data_art"]) {
    if (!criar && dados[campo] === undefined) continue;
    const valor = dados[campo] == null ? null : String(dados[campo]).trim() || null;
    if (campo === "data_art" && valor !== null && !/^\d{4}-\d{2}-\d{2}$/.test(valor)) throw erro("Data da ART inválida. Use o formato AAAA-MM-DD.", 400);
    r[campo] = valor;
  }
  if (criar || dados.status != null) {
    r.status = dados.status ?? "RASCUNHO";
    if (!["RASCUNHO", "GERADO"].includes(r.status)) throw erro("Status inválido. Use RASCUNHO ou GERADO.", 400);
  }
  return r;
}
function exigir(r, mensagem = "Relatório não encontrado.") { if (!r) throw erro(mensagem, 404); return r; }
async function criarRelatorio(dados, usuario) {
  const u = identidade(usuario); const c = campos(dados, true); const id = idValido(dados.id_local, "ID do local");
  return exigir(await repository.criarNoAmbiente({ ...c, id_local: id }, u), "Local não encontrado.");
}
async function listarRelatorios(usuario) { return repository.listarPermitidosNoAmbiente(identidade(usuario)); }
async function buscarRelatorioPorId(id, usuario) { const u = identidade(usuario); return exigir(await repository.buscarPorIdNoAmbiente(idValido(id), u)); }
async function buscarRelatorioPorLocal(id, usuario) {
  const u = identidade(usuario); id = idValido(id, "ID do local");
  exigir(await repository.buscarLocalAutorizadoNoAmbiente(id, u), "Local não encontrado.");
  return exigir(await repository.buscarPorLocalNoAmbiente(id, u), "Relatório não encontrado para este local.");
}
async function atualizarRelatorio(id, dados, usuario) {
  const u = identidade(usuario); id = idValido(id); return exigir(await repository.atualizarNoAmbiente(id, campos(dados, false), u));
}
async function excluirRelatorio(id, usuario) { const u = identidade(usuario); return exigir(await repository.excluirNoAmbiente(idValido(id), u)); }
async function buscarRelatorioCompleto(id, usuario) { const u = identidade(usuario); return exigir(await repository.buscarCompletoNoAmbiente(idValido(id), u)); }
async function gerarPdfRelatorio(id, usuario) {
  const u = identidade(usuario); id = idValido(id);
  return exigir(await repository.gerarNoAmbiente(id, u, async dados => {
    const imagens = new Map();
    for (const e of dados.evidencias || []) {
      const imagem = await arquivos.lerFoto(e, u, normalizarIdDominio(dados.id_local));
      if (imagem) imagens.set(e.id_evidencia, imagem);
    }
    const buffer = await pdfService.gerarPdfRelatorio(dados, { somenteBuffer: true, imagens });
    return arquivos.persistirPdf(buffer, u, id);
  }));
}
async function obterPdfParaDownload(id, usuario) {
  const u = identidade(usuario); id = idValido(id);
  return exigir(await repository.comRelatorioAutorizado(id, u, async r => {
    if (!r.caminho_pdf) throw erro("Este relatório ainda não possui PDF gerado.", 404);
    try { return { relatorio: r, ...await arquivos.lerPdf({ ...r, id_relatorio: normalizarIdDominio(r.id_relatorio) }, u) }; }
    catch (falha) {
      if (falha.code === "ENOENT" || falha.statusCode === 404) throw erro("Arquivo PDF não encontrado no servidor.", 404);
      throw erro("Erro interno ao obter PDF.", 500);
    }
  }));
}
module.exports = { criarRelatorio, listarRelatorios, buscarRelatorioPorId, buscarRelatorioPorLocal,
  atualizarRelatorio, excluirRelatorio, buscarRelatorioCompleto, gerarPdfRelatorio, obterPdfParaDownload };
