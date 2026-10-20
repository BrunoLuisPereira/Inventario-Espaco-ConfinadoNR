const PADRAO_BANCO = /^nr33_lab_[0-9]{8}_[a-f0-9]{6}$/;
const IMAGEM = 'postgres:17.10';
const BANCO_DEV = 'inventario_nr33_multitenant_dev';
function destino(banco) {
  if (banco === BANCO_DEV) return {
    banco, container: 'nr33-multitenant-dev-710', rede: 'nr33-multitenant-dev-710-rede',
    volume: 'nr33-multitenant-dev-710-dados', id: 'multitenant-dev-710',
    imagem: IMAGEM, host: '127.0.0.1', porta: 55432, portaHTTP: 3001,
    papel: 'nr33_dev_app', autorizacao: 'PASSO710', marcadorSQL: 'passo710', persistente: true,
  };
  if (typeof banco !== 'string' || PADRAO_BANCO.exec(banco)?.[0] !== banco) throw Error('Nome de banco descartavel invalido.');
  return { banco, container: banco.replaceAll('_', '-'), rede: banco.replaceAll('_', '-') + '-rede',
    id: banco.slice('nr33_lab_'.length), imagem: IMAGEM, host: '127.0.0.1', porta: 55432, portaHTTP: 3001,
    papel: 'nr33_lab_app', autorizacao: 'PASSO702', marcadorSQL: 'passo702', persistente: false };
}
function validarAmbiente(env) {
  const d = destino(env.DB_NAME);
  if (env.NR33_LAB_AUTORIZADO !== d.autorizacao || env.DB_HOST !== d.host || env.DB_PORT !== String(d.porta) ||
      env.DB_USER !== d.papel || typeof env.DB_PASSWORD !== 'string' || env.DB_PASSWORD.length < 32 ||
      typeof env.JWT_SECRET !== 'string' || env.JWT_SECRET.length < 48) throw Error('Configuracao isolada de laboratorio obrigatoria.');
  return d;
}
function validarContainer(d, info) {
  const binding = info?.ports?.['5432/tcp'];
  if (info?.labels?.['nr33.lab.id'] !== d.id || info?.image !== IMAGEM || info?.running !== true ||
      !Array.isArray(binding) || binding.length !== 1 || binding[0].HostIp !== d.host || binding[0].HostPort !== String(d.porta)) {
    throw Error('Identidade ou porta do container descartavel nao comprovada.');
  }
  if (d.persistente && (!Array.isArray(info.mounts) || info.mounts.length !== 1 ||
      info.mounts[0].Type !== 'volume' || info.mounts[0].Name !== d.volume ||
      info.mounts[0].Destination !== '/var/lib/postgresql/data')) {
    throw Error('Volume exclusivo de desenvolvimento nao comprovado.');
  }
  return d;
}
module.exports = { destino, validarAmbiente, validarContainer };
