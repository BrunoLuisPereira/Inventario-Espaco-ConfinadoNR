const matriz = require('../../../shared/permissoes.json');
const perfis = Object.freeze([...matriz.perfis]);
const perfisConvite = Object.freeze(perfis.filter(p => p !== 'ADMINISTRADOR'));
function perfisDaCapacidade(capacidade) {
  if (!Object.hasOwn(matriz.capacidades, capacidade)) throw new Error('Capacidade desconhecida.');
  return matriz.capacidades[capacidade];
}
function administrativa(capacidade) { return perfisDaCapacidade(capacidade).length === 1; }
function pode(usuario, capacidade) {
  return !!usuario && perfisDaCapacidade(capacidade).includes(usuario.perfil_acesso) &&
    (!administrativa(capacidade) || usuario.eh_fundador === true);
}
function sqlCapacidade(alias, capacidade) {
  if (!/^[a-z_]+$/.test(alias)) throw new Error('Alias interno invalido.');
  const lista = perfisDaCapacidade(capacidade).map(p => "'" + p + "'").join(', ');
  return `(${alias}.perfil_acesso IN (${lista})${administrativa(capacidade) ? ` AND ${alias}.eh_fundador = TRUE` : ''})`;
}
function exigir(usuario, capacidade) {
  if (!pode(usuario, capacidade)) throw Object.assign(new Error('Você não possui permissão para esta operação.'), { statusCode: usuario ? 403 : 401 });
}
function autorizarCapacidade(capacidade) {
  perfisDaCapacidade(capacidade);
  return (req, res, next) => {
    if (res.headersSent) return res;
    try { exigir(req.usuario, capacidade); return next(); }
    catch (e) { return res.status(e.statusCode).json({ status: 'error', message: e.message }); }
  };
}
function autorizarModulo(modulo) {
  return (req, res, next) => {
    let operacao = ['GET', 'HEAD'].includes(req.method) ? 'consultar' :
      req.method === 'POST' ? 'criar' : req.method === 'DELETE' ? 'excluir' : 'editar';
    if (modulo === 'locais' && req.path === '/exportar') operacao = 'exportar';
    if (modulo === 'relatorios' && /\/gerar-pdf$/.test(req.path)) operacao = 'gerar';
    if (modulo === 'sincronizacao') operacao = ['GET', 'HEAD'].includes(req.method) ? 'consultar' : 'executar';
    if (modulo === 'checklists' && /\/status$/.test(req.path)) operacao = 'editar';
    if (['campanhas', 'locais'].includes(modulo) && /\/status$/.test(req.path)) operacao = 'status';
    return autorizarCapacidade(modulo + '.' + operacao)(req, res, next);
  };
}
module.exports = { perfis, perfisConvite, pode, exigir, sqlCapacidade, autorizarCapacidade, autorizarModulo };
