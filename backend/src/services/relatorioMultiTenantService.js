const repository = require("../repositories/relatorioMultiTenantRepository");
const pdfService = require("./pdfService");
const arquivos = require("../utils/relatorioArquivoUtils");
const normalizarIdDominio = require("../utils/normalizarIdDominio");
const { normalizarIdioma } = require('../utils/idiomaPdf');
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
async function gerarPdfRelatorio(id, usuario, idiomaRecebido) {
  const u = identidade(usuario); id = idValido(id);
  return exigir(await repository.gerarNoAmbiente(id, u, async dados => {
    const idioma = normalizarIdioma(idiomaRecebido === undefined ? dados.idioma_solicitante : idiomaRecebido);
    const imagens = new Map();
    for (const e of dados.evidencias || []) {
      const imagem = await arquivos.lerFoto(e, u, normalizarIdDominio(dados.id_local));
      if (imagem) imagens.set(e.id_evidencia, imagem);
    }
    const buffer = await pdfService.gerarPdfRelatorio({ ...dados, status: 'GERADO' }, { somenteBuffer: true, imagens, idioma });
    return { ...await arquivos.persistirPdf(buffer, u, id), idioma };
  }));
}
async function listarGeracoesPdf(id, usuario, idioma) {
  return exigir(await repository.listarGeracoesNoAmbiente(idValido(id), identidade(usuario), normalizarIdioma(idioma)));
}
async function obterPdfParaDownload(id, usuario, idGeracao, idiomaEsperado) {
  const u = identidade(usuario); id = idValido(id);
  if (idGeracao !== undefined) {
    if (typeof idGeracao !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idGeracao)) throw erro('Geração PDF inválida.', 400);
    return exigir(await repository.comGeracaoAutorizada(id, u, idGeracao, async (g, r) => {
      if (idiomaEsperado !== undefined && g.idioma !== normalizarIdioma(idiomaEsperado)) throw erro('Idioma do PDF diferente do solicitado.', 409);
      // Vínculo físico exato: o UUID da geração também integra o nome seguro.
      if (g.caminho_pdf !== `uploads/relatorios/relatorio-${id}-${u.id_ambiente}_${g.id_geracao}.pdf`) throw erro('Arquivo PDF indisponível.', 404);
      try { return { relatorio: r, geracao: g, ...await arquivos.lerPdf({ ...g, id_relatorio: id }, u) }; }
      catch (falha) {
        if (falha.code === 'ENOENT' || falha.statusCode === 404) throw erro('Arquivo PDF não encontrado no servidor.', 404);
        throw erro('Erro interno ao obter PDF.', 500);
      }
    }));
  }
  // A rota sem UUID serve exclusivamente o arquivo legado, de idioma desconhecido.
  if (idiomaEsperado !== undefined) throw erro('Selecione uma geração com idioma conhecido.', 404);
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
  atualizarRelatorio, excluirRelatorio, buscarRelatorioCompleto, gerarPdfRelatorio, obterPdfParaDownload, listarGeracoesPdf };
