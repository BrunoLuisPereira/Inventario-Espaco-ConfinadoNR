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
    criarLinkConvite(token) {
      if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) throw new Error('Token inválido.');
      return `${origem()}/convites/aceitar#token=${token}`;
    },
    async enviarConvite(para, token) {
      const link = this.criarLinkConvite(token);
      if (typeof para !== 'string' || para.length > 180 || !/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(para)) {
        throw new Error('Destinatário inválido.');
      }
      await transporte.enviar({ para, assunto: 'Você foi convidado — Inventário de Espaços Confinados NR-33',
        texto: `Inventário de Espaços Confinados NR-33\nVocê foi convidado para integrar um ambiente no sistema.\nAceitar convite e criar conta: ${link}\nEste convite é válido por 48 horas a partir da emissão e pode ser usado uma única vez.\nSe não reconhece este convite, ignore esta mensagem. Não compartilhe este link.`,
        html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#1f2937;padding:24px"><h1 style="font-size:22px">Inventário de Espaços Confinados NR-33</h1><p>Você foi convidado para integrar um ambiente no sistema.</p><p style="margin:28px 0"><a href="${link}" style="background:#166534;color:#fff;padding:14px 20px;border-radius:6px;text-decoration:none;display:inline-block">Aceitar convite e criar conta</a></p><p>Este convite é válido por <strong>48 horas a partir da emissão</strong> e pode ser usado uma única vez.</p><p>Se não reconhece este convite, ignore esta mensagem. Não compartilhe este link.</p></div>` });
    },
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
