const { randomBytes, createHash, createHmac } = require('node:crypto');
const bcrypt = require('bcryptjs');
const { repository } = require('../repositories/recuperacaoSenhaRepository');
const { emailService } = require('./emailService');
const { normalizarIp } = require('./loginProtecaoService');
const { hmacValido } = require('../utils/loginHmac');
const mensagem = 'Se houver uma conta habilitada para este e-mail, enviaremos as instruções de recuperação.';
const invalido = () => Object.assign(new Error('Link inválido, expirado ou já utilizado. Solicite uma nova recuperação.'), { statusCode: 400, publicoRecuperacao: true });
const erro = (message, statusCode) => Object.assign(new Error(message), { statusCode, publicoRecuperacao: true });
const hashToken = token => createHash('sha256').update(token).digest('hex');

function criarServico({ repo = repository, email = emailService,
  segredo = () => process.env.LOGIN_HMAC_SECRET, hashSenha = senha => bcrypt.hash(senha, 12) } = {}) {
  async function limitar(tipo, valor, maximo) {
    const chave = segredo();
    if (!hmacValido(chave)) throw erro('Recuperação temporariamente indisponível.', 503);
    const hash = createHmac('sha256', Buffer.from(chave, 'base64')).update(`recuperacao:${tipo}\0${valor}`).digest('hex');
    return repo.limitar(hash, maximo);
  }
  async function limitarIp(ip, tipo, maximo) {
    if (!await limitar(tipo, normalizarIp(ip), maximo)) throw erro('Muitas solicitações. Aguarde 15 minutos e tente novamente.', 429);
  }
  return {
    async solicitar(dados, ip) {
      await limitarIp(ip, 'solicitar-ip', 20);
      const endereco = dados?.email;
      if (typeof endereco !== 'string' || endereco.trim().length > 180 ||
          !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(endereco.trim())) throw erro('Informe um e-mail válido.', 400);
      // Falha de configuração é igual para todos, antes de consultar a conta.
      if (!email.disponivel()) throw erro('Envio de recuperação indisponível no momento. O serviço de e-mail ainda não foi integrado.', 503);
      const normalizado = endereco.trim().toLowerCase();
      if (!await limitar('email', normalizado, 5)) return { mensagem };
      await repo.enfileirar(normalizado);
      return { mensagem };
    },
    async processarProximo() {
      if (!email.disponivel()) return false;
      const envio = await repo.reivindicar();
      if (!envio) return false;
      const token = randomBytes(32).toString('hex');
      const tokenHash = hashToken(token);
      try {
        const conta = await repo.emitir(envio.email, tokenHash);
        if (conta) {
          // Somente a confirmação do transporte permite ativação no banco.
          await email.enviarRecuperacao(conta.email, token);
          await repo.ativar(tokenHash, envio.id_envio, envio.reserva);
        }
      } catch {
        // Mesmo se esta limpeza falhar, o token não ativado NÃO pode ser usado.
        await repo.invalidar(tokenHash).catch(() => {});
      } finally {
        // Se o banco cair, a reserva expira; uma retomada gera outro token.
        await repo.finalizar(envio.id_envio, envio.reserva);
      }
      return true;
    },
    async redefinir(dados, ip) {
      await limitarIp(ip, 'redefinir-ip', 30);
      const { token, novaSenha, confirmarSenha } = dados || {};
      if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) throw invalido();
      if (typeof novaSenha !== 'string' || novaSenha.length < 8) throw erro('A nova senha deve possuir pelo menos 8 caracteres.', 400);
      // bcrypt utiliza no máximo 72 bytes: não aceita truncamento silencioso.
      if (Buffer.byteLength(novaSenha, 'utf8') > 72) throw erro('A nova senha deve possuir no máximo 72 bytes em UTF-8.', 400);
      if (novaSenha !== confirmarSenha) throw erro('A confirmação da nova senha não confere.', 400);
      if (!await repo.consumir(hashToken(token), () => hashSenha(novaSenha))) throw invalido();
    },
  };
}
module.exports = { criarServico, servico: criarServico(), mensagem, hashToken };
