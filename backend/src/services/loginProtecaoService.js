const { createHmac } = require('node:crypto');
const { isIP } = require('node:net');
const repository = require('../repositories/loginTentativaRepository');
const { hmacValido } = require('../utils/loginHmac');

function indisponivel() {
  return Object.assign(new Error('Login temporariamente indisponível. Tente novamente.'), { statusCode: 503 });
}

function normalizarIp(valor) {
  if (typeof valor !== 'string' || !isIP(valor)) throw indisponivel();
  if (valor.toLowerCase().startsWith('::ffff:') && isIP(valor.slice(7)) === 4) return valor.slice(7);
  if (isIP(valor) === 4) return valor;
  // URL canoniza grafias equivalentes; agrupa IPv6 /64 para dificultar rotação.
  const canonico = new URL(`http://[${valor}]/`).hostname.slice(1, -1);
  const [antes, depois = ''] = canonico.split('::');
  const inicio = antes ? antes.split(':') : [];
  const fim = depois ? depois.split(':') : [];
  const partes = canonico.includes('::') ? [...inicio, ...Array(8 - inicio.length - fim.length).fill('0'), ...fim] : inicio;
  if (partes.slice(0, 5).every(p => parseInt(p, 16) === 0) && partes[5] === 'ffff') {
    const final = partes.slice(6).map(p => parseInt(p, 16));
    return [final[0] >> 8, final[0] & 255, final[1] >> 8, final[1] & 255].join('.');
  }
  return partes.slice(0, 4).map(p => p.padStart(4, '0')).join(':') + '::/64';
}

async function executar(email, ip, verificar) {
  try {
    const segredo = process.env.LOGIN_HMAC_SECRET;
    if (!hmacValido(segredo)) {
      throw indisponivel();
    }
    const chave = (tipo, valor) => createHmac('sha256', Buffer.from(segredo, 'base64'))
      .update(`${tipo}\0${valor}`).digest('hex');
    // Identificador global, igual à normalização da autenticação existente.
    // Não aceita id_ambiente do cliente para variar a chave.
    await repository.limitarIp(chave('ip', normalizarIp(ip)));
    return await repository.autenticar(chave('identificador', email.trim().toLowerCase()), verificar);
  } catch (erro) {
    if ([401, 429].includes(erro.statusCode)) throw erro;
    // Não loga erros do driver, SQL, segredo, endereço ou credenciais.
    throw indisponivel();
  }
}

module.exports = { executar, normalizarIp };
