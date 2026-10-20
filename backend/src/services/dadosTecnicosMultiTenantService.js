const repository = require("../repositories/dadosTecnicosMultiTenantRepository");
const NUMEROS = ["pressao_atmosferica", "oxigenio", "gas_inflamavel", "monoxido_carbono", "sulfeto_hidrogenio", "temperatura", "umidade"];
const VENTILACOES = ["NATURAL", "MECANICA", "FORCADA", "NAO_INFORMADA"];
const STATUS = ["PENDENTE", "CONCLUIDO"];
function erro(message, statusCode) { return Object.assign(new Error(message), { statusCode }); }
function idValido(valor, mensagem, statusCode = 400) {
  if (!["number", "string"].includes(typeof valor) || !Number.isSafeInteger(Number(valor)) || Number(valor) <= 0) throw erro(mensagem, statusCode);
  return Number(valor);
}
function identidade(usuario) {
  if (!usuario || typeof usuario !== "object" || Array.isArray(usuario) ||
    typeof usuario.id_ambiente !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(usuario.id_ambiente)) throw erro("Usuário não autenticado.", 401);
  return { id_usuario: idValido(usuario.id_usuario, "Usuário não autenticado.", 401), id_ambiente: usuario.id_ambiente };
}
function camposPermitidos(dados, criacao) {
  if (!dados || typeof dados !== "object" || Array.isArray(dados)) throw erro("Dados técnicos inválidos.", 400);
  const resultado = {};
  for (const campo of NUMEROS) {
    const valor = dados[campo];
    if (valor == null) continue; // PUT null/omitido preserva, conforme o legado.
    if (!["number", "string"].includes(typeof valor) || typeof valor === "string" && !valor.trim() || !Number.isFinite(Number(valor))) throw erro(`O campo ${campo} deve possuir um valor numérico válido.`, 400);
    // Não converte strings: mantém precisão textual e unidades existentes.
    resultado[campo] = valor;
  }
  if (dados.ventilacao != null) {
    if (!VENTILACOES.includes(dados.ventilacao)) throw erro("Ventilação inválida. Use NATURAL, MECANICA, FORCADA ou NAO_INFORMADA.", 400);
    resultado.ventilacao = dados.ventilacao;
  } else if (criacao) resultado.ventilacao = "NAO_INFORMADA";
  if (dados.status !== undefined && (criacao || dados.status !== null)) {
    if (!STATUS.includes(dados.status)) throw erro("Status inválido. Use PENDENTE ou CONCLUIDO.", 400);
    resultado.status = dados.status;
  } else if (criacao) resultado.status = "PENDENTE";
  if (dados.observacoes != null) {
    if (typeof dados.observacoes !== "string") throw erro("O campo observacoes deve ser um texto.", 400);
    resultado.observacoes = dados.observacoes;
  }
  return resultado;
}
function exigir(dados, mensagem = "Dados técnicos não encontrados.") {
  if (!dados) throw erro(mensagem, 404);
  return dados;
}
async function criarDadosTecnicos(dados, usuarioAutenticado) {
  const u = identidade(usuarioAutenticado);
  const campos = camposPermitidos(dados, true);
  const id = idValido(dados.id_local, "ID do local inválido.");
  return exigir(await repository.criarNoAmbiente({ id_local: id, ...campos }, u), "Local não encontrado.");
}
async function listarDadosTecnicos(usuarioAutenticado) {
  return repository.listarPermitidosNoAmbiente(identidade(usuarioAutenticado));
}
async function buscarDadosTecnicosPorId(idDados, usuarioAutenticado) {
  const u = identidade(usuarioAutenticado);
  const id = idValido(idDados, "ID dos dados técnicos inválido.");
  return exigir(await repository.buscarPorIdNoAmbiente(id, u));
}
async function buscarDadosTecnicosPorLocal(idLocal, usuarioAutenticado) {
  const u = identidade(usuarioAutenticado);
  const id = idValido(idLocal, "ID do local inválido.");
  exigir(await repository.buscarLocalAutorizadoNoAmbiente(id, u), "Local não encontrado.");
  return exigir(await repository.buscarPorLocalNoAmbiente(id, u), "Dados técnicos não encontrados para este local.");
}
async function atualizarDadosTecnicos(idDados, dados, usuarioAutenticado) {
  const u = identidade(usuarioAutenticado);
  const id = idValido(idDados, "ID dos dados técnicos inválido.");
  return exigir(await repository.atualizarNoAmbiente(id, camposPermitidos(dados, false), u));
}
async function excluirDadosTecnicos(idDados, usuarioAutenticado) {
  const u = identidade(usuarioAutenticado);
  const id = idValido(idDados, "ID dos dados técnicos inválido.");
  return exigir(await repository.excluirNoAmbiente(id, u));
}
module.exports = { criarDadosTecnicos, listarDadosTecnicos, buscarDadosTecnicosPorId,
  buscarDadosTecnicosPorLocal, atualizarDadosTecnicos, excluirDadosTecnicos };
