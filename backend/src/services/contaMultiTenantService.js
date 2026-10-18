const repository = require('../repositories/contaMultiTenantRepository');
const bcrypt = require('bcryptjs');
const { erroConta } = repository;
const tem = (objeto, campo) => Object.prototype.hasOwnProperty.call(objeto, campo);

async function buscarPerfil(usuario) {
  return repository.buscarPerfil(usuario);
}

async function atualizarPerfil(dados, usuario) {
  repository.validarIdentidade(usuario);
  if (!dados || typeof dados !== 'object' || Array.isArray(dados)) {
    throw erroConta('Nome e e-mail são obrigatórios.', 400);
  }
  const temNome = tem(dados, 'nome');
  const temEmail = tem(dados, 'email');
  if ((!temNome && !temEmail) ||
      (temNome && (typeof dados.nome !== 'string' || !dados.nome.trim())) ||
      (temEmail && (typeof dados.email !== 'string' || !dados.email.trim()))) {
    throw erroConta('Nome e e-mail são obrigatórios.', 400);
  }
  return repository.atualizarPerfil(usuario, {
    temNome, nome: temNome ? dados.nome.trim() : null,
    temEmail, email: temEmail ? dados.email.trim().toLowerCase() : null,
  });
}

async function alterarSenha(dados, usuario) {
  repository.validarIdentidade(usuario);
  const { senhaAtual, novaSenha, confirmarSenha } = dados || {};
  if (typeof senhaAtual !== 'string' || !senhaAtual) throw erroConta('Informe a senha atual.', 400);
  if (typeof novaSenha !== 'string' || novaSenha.length < 8) throw erroConta('A nova senha deve possuir pelo menos 8 caracteres.', 400);
  if (novaSenha !== confirmarSenha) throw erroConta('A confirmação da nova senha não confere.', 400);
  if (novaSenha === senhaAtual) throw erroConta('A nova senha deve ser diferente da senha atual.', 400);
  await repository.alterarSenha(usuario, async (hashAtual) => {
    if (!await bcrypt.compare(senhaAtual, hashAtual)) throw erroConta('A senha atual está incorreta.', 400);
    return bcrypt.hash(novaSenha, 12);
  });
}

module.exports = { buscarPerfil, atualizarPerfil, alterarSenha };
