// Adaptador SMTP independente de provedor. Não abre conexão na configuração.
// Segredos vêm exclusivamente do ambiente do processo, nunca do corpo HTTP.
const { isIP } = require('node:net');

function hostnamePublico(host) {
  return typeof host === 'string' && host.length <= 253 && !isIP(host) &&
    /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(host) &&
    !/(?:^|\.)(?:localhost|local|internal)$/i.test(host);
}

function enderecoValido(endereco) {
  return typeof endereco === 'string' && endereco.length <= 180 &&
    /^[a-z0-9.!#$%&'*+\-/=?^_`{|}~]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,63}$/i.test(endereco);
}

function criarTransporteExterno(env, criarTransporte) {
  const invalida = () => new Error('Configuração de e-mail externo inválida.');
  // Captura a configuração uma vez; alterações posteriores no objeto não mudam
  // destinatário/remetente, credenciais ou origem de um transporte já criado.
  const host = env.SMTP_HOST;
  const porta = env.SMTP_PORT;
  const usuario = env.SMTP_USER;
  const senha = env.SMTP_PASSWORD;
  const remetente = env.EMAIL_FROM;
  let origem;
  try { origem = new URL(env.APP_PUBLIC_URL); } catch { throw invalida(); }
  if (origem.protocol !== 'https:' || origem.username || origem.password ||
      origem.search || origem.hash || origem.pathname !== '/' || !hostnamePublico(origem.hostname) ||
      !hostnamePublico(host) || !['465', '587'].includes(porta) || !enderecoValido(remetente) ||
      typeof usuario !== 'string' || !usuario.trim() || usuario.length > 1024 || /[\x00-\x1f\x7f]/.test(usuario) ||
      typeof senha !== 'string' || !senha.trim() || senha.length > 4096 || /[\x00-\x1f\x7f]/.test(senha)) {
    throw invalida();
  }
  let cliente;
  try {
    cliente = (criarTransporte || require('nodemailer').createTransport)({
      host, port: Number(porta), secure: porta === '465',
      requireTLS: true, ignoreTLS: false,
      auth: { user: usuario, pass: senha },
      tls: { rejectUnauthorized: true, minVersion: 'TLSv1.2', servername: host },
      dnsTimeout: 5000, connectionTimeout: 5000, greetingTimeout: 5000, socketTimeout: 10000,
      logger: false, debug: false, disableFileAccess: true, disableUrlAccess: true,
    });
  } catch { throw invalida(); }
  return {
    async enviar({ para, assunto, texto, html }) {
      try {
        if (!enderecoValido(para)) throw new Error();
        const resultado = await cliente.sendMail({ from: remetente, to: para, subject: assunto, text: texto, html });
        if (resultado.accepted?.length !== 1 || resultado.rejected?.length ||
            typeof resultado.accepted[0] !== 'string' || resultado.accepted[0].toLowerCase() !== para.toLowerCase()) {
          throw new Error();
        }
      } catch {
        // Não anexa cause, response, command ou code do provedor: podem conter
        // credenciais, destinatário, token e o conteúdo completo da mensagem.
        throw new Error('Não foi possível confirmar o envio do e-mail.');
      }
    },
  };
}

module.exports = { criarTransporteExterno };
