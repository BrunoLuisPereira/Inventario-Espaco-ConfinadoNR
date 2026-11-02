// Sem fallback de console ou transporte simulado em produção.
// Um adaptador futuro implementa { enviar({ para, assunto, texto, html }) }.
function criarServicoEmail({ transporte, urlPublica } = {}) {
  function origem() {
    const url = new URL(urlPublica);
    if (url.username || url.password || url.search || url.hash || url.pathname !== '/' ||
        !(url.protocol === 'https:' || (url.protocol === 'http:' &&
          ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))) {
      throw new Error('URL pública inválida.');
    }
    return url.origin;
  }
  return {
    disponivel() {
      try { origem(); return typeof transporte?.enviar === 'function'; }
      catch { return false; }
    },
    async enviarRecuperacao(para, token) {
      if (!/^[a-f0-9]{64}$/.test(token)) throw new Error('Token inválido.');
      const link = `${origem()}/redefinir-senha#token=${token}`;
      // Não inclui nomes/HTML fornecidos pelo usuário. Origem e token validados.
      await transporte.enviar({ para, assunto: 'Redefinir sua senha — Inventário NR-33',
        texto: `Para redefinir sua senha, acesse ${link}\nO link expira em 30 minutos e pode ser usado uma única vez. Se não solicitou, ignore esta mensagem.`,
        html: `<p>Redefina sua senha no Inventário NR-33.</p><p><a href="${link}">Redefinir senha</a></p><p>O link expira em 30 minutos e pode ser usado uma única vez. Se não solicitou, ignore esta mensagem.</p>` });
    },
  };
}

function criarEmailConfigurado(env = process.env, criarTransporte) {
  let transporte;
  if (env.EMAIL_TRANSPORT === 'local-smtp') {
    // IP literal: nenhuma resolução DNS ou conexão com servidor externo.
    if (!['127.0.0.1', '::1'].includes(env.SMTP_HOST) ||
        !/^\d{1,5}$/.test(env.SMTP_PORT || '') || Number(env.SMTP_PORT) < 1 || Number(env.SMTP_PORT) > 65535 ||
        !/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(env.EMAIL_FROM || '') ||
        env.SMTP_USER || env.SMTP_PASSWORD) throw new Error('Configuração de e-mail local inválida.');
    const cliente = (criarTransporte || require('nodemailer').createTransport)({
      host: env.SMTP_HOST, port: Number(env.SMTP_PORT), secure: false, ignoreTLS: true,
      connectionTimeout: 5000, greetingTimeout: 5000, socketTimeout: 10000,
      logger: false, debug: false, disableFileAccess: true, disableUrlAccess: true,
    });
    transporte = { async enviar({ para, assunto, texto, html }) {
      const r = await cliente.sendMail({ from: env.EMAIL_FROM, to: para, subject: assunto, text: texto, html });
      if (r.accepted?.length !== 1 || r.rejected?.length) throw new Error('Entrega não confirmada.');
    } };
  } else if (env.EMAIL_TRANSPORT && env.EMAIL_TRANSPORT !== 'disabled') {
    throw new Error('Transporte de e-mail não permitido.');
  }
  const servico = criarServicoEmail({ transporte, urlPublica: env.APP_PUBLIC_URL });
  if (env.EMAIL_TRANSPORT === 'local-smtp' && !servico.disponivel()) throw new Error('URL pública inválida.');
  return servico;
}
const emailService = criarEmailConfigurado();
module.exports = { criarServicoEmail, criarEmailConfigurado, emailService };
