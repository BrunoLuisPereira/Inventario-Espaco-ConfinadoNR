const repository = require('../repositories/sincronizacaoMultiTenantRepository');
const erro = (message, statusCode) => Object.assign(new Error(message), { statusCode });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const entidades = ['CAMPANHA', 'LOCAL', 'CHECKLIST_NR33', 'DADOS_TECNICOS', 'EVIDENCIA'];
function id(valor) {
  if (!['number', 'string'].includes(typeof valor) || !Number.isSafeInteger(Number(valor)) || Number(valor) <= 0) throw erro('Identificador inválido.', 400);
  return Number(valor);
}
function identidade(u) {
  if (!u || typeof u !== 'object' || Array.isArray(u) || typeof u.id_ambiente !== 'string' || !UUID.test(u.id_ambiente)) throw erro('Usuário não autenticado.', 401);
  try { return { id_usuario: id(u.id_usuario), id_ambiente: u.id_ambiente.toLowerCase() }; }
  catch { throw erro('Usuário não autenticado.', 401); }
}
function objeto(d) { if (!d || typeof d !== 'object' || Array.isArray(d)) throw erro('Dados da sincronização inválidos.', 400); return d; }
function entidade(e) { const valor = typeof e === 'string' ? e.trim().toUpperCase() : ''; if (!entidades.includes(valor)) throw erro('Entidade inválida.', 400); return valor; }
function uuid(v) { if (v == null) return null; if (typeof v !== 'string' || !UUID.test(v)) throw erro('Identificador UUID inválido.', 400); return v.toLowerCase(); }
async function criarSincronizacao(dados, usuario) {
  const u = identidade(usuario); const d = objeto(dados);
  if (!['CRIAR', 'ATUALIZAR', 'EXCLUIR'].includes(d.operacao)) throw erro('Operação inválida.', 400);
  const registro = { entidade: entidade(d.entidade), operacao: d.operacao,
    id_entidade: d.operacao === 'CRIAR' ? null : id(d.id_entidade),
    versao_cliente: id(d.versao_cliente ?? 1), id_operacao_cliente: uuid(d.id_operacao_cliente),
    id_registro_cliente: uuid(d.id_registro_cliente), dados_cliente: d.dados_cliente ?? null };
  if (registro.versao_cliente > 2147483647) throw erro('Versão do cliente inválida.', 400);
  if (registro.operacao === 'CRIAR' && !registro.id_registro_cliente) throw erro('O ID do registro do cliente é obrigatório para a operação CRIAR.', 400);
  return repository.registrar(registro, u);
}
const listarSincronizacoes = usuario => repository.listar({}, identidade(usuario));
const buscarPendentes = usuario => repository.listar({ status: 'PENDENTE' }, identidade(usuario));
const buscarConflitos = usuario => repository.listar({ status: 'CONFLITO' }, identidade(usuario));
const buscarPorEntidade = (e, valor, usuario) => { const u = identidade(usuario); return repository.listar({ entidade: entidade(e), id_entidade: id(valor) }, u); };
const buscarSincronizacaoPorId = (valor, usuario) => { const u = identidade(usuario); return repository.buscar(id(valor), u); };
const excluirSincronizacao = (valor, usuario) => { const u = identidade(usuario); return repository.excluir(id(valor), u); };
const processarSincronizacao = (valor, usuario) => { const u = identidade(usuario); return repository.processar(id(valor), u); };
const atualizarStatus = (valor, dados, usuario) => { const u = identidade(usuario); return repository.atualizarStatus(id(valor), objeto(dados), u); };
const resolverConflito = (valor, dados, usuario) => {
  const u = identidade(usuario), d = objeto(dados);
  if (!['CLIENTE', 'SERVIDOR', 'MESCLADO'].includes(d.resolucao)) throw erro('Resolução inválida. Valores permitidos: CLIENTE, SERVIDOR ou MESCLADO.', 400);
  return repository.resolver(id(valor), { resolucao: d.resolucao, dados_resolvidos: d.dados_resolvidos ?? null }, u);
};
module.exports = { criarSincronizacao, listarSincronizacoes, buscarSincronizacaoPorId, buscarPorEntidade,
  buscarPendentes, buscarConflitos, atualizarStatus, excluirSincronizacao, resolverConflito, processarSincronizacao };
