const PADRAO_BANCO = /^nr33_lab_[0-9]{8}_[a-f0-9]{6}$/;
const IMAGEM = 'postgres:17.10';
function destino(banco) {
  if (typeof banco !== 'string' || !PADRAO_BANCO.test(banco)) throw Error('Nome de banco descartavel invalido.');
  return { banco, container: banco.replaceAll('_', '-'), rede: banco.replaceAll('_', '-') + '-rede',
    id: banco.slice('nr33_lab_'.length), imagem: IMAGEM, host: '127.0.0.1', porta: 55432, portaHTTP: 3001 };
}
function validarAmbiente(env) {
  const d = destino(env.DB_NAME);
  if (env.NR33_LAB_AUTORIZADO !== 'PASSO702' || env.DB_HOST !== d.host || env.DB_PORT !== String(d.porta) ||
      env.DB_USER !== 'nr33_lab_app' || typeof env.DB_PASSWORD !== 'string' || env.DB_PASSWORD.length < 32 ||
      typeof env.JWT_SECRET !== 'string' || env.JWT_SECRET.length < 48) throw Error('Configuracao isolada de laboratorio obrigatoria.');
  return d;
}
function validarContainer(d, info) {
  const binding = info?.ports?.['5432/tcp'];
  if (info?.labels?.['nr33.lab.id'] !== d.id || info?.image !== IMAGEM || info?.running !== true ||
      !Array.isArray(binding) || binding.length !== 1 || binding[0].HostIp !== d.host || binding[0].HostPort !== String(d.porta)) {
    throw Error('Identidade ou porta do container descartavel nao comprovada.');
  }
  return d;
}
module.exports = { destino, validarAmbiente, validarContainer };
