// Preload de testes: nenhum pool real nem arquivo .env/uploads é acessado.
const Module = require('node:module');
const path = require('node:path');
const fs = require('node:fs');
// Parsers puros: nao carrega pg nem disponibiliza seu transporte de rede.
const types = require('pg-types');
const database = path.resolve(__dirname, '../../src/config/database.js');
const bloqueado = () => { throw new Error('Acesso real ao PostgreSQL proibido na suíte simulada'); };
const pool = { query: bloqueado, connect: bloqueado, on() { return this; }, end: async () => {} };
require.cache[database] = { id: database, filename: database, loaded: true, exports: pool };
const carregar = Module._load;
Module._load = function (request, parent, ...args) {
  if (request === 'pg') return { types, Pool: class { constructor() { return pool; } }, Client: class { connect() { bloqueado(); } query() { bloqueado(); } } };
  if (request === 'dotenv' || request.startsWith('dotenv/')) return { config() { return { parsed: {} }; } };
  return carregar.call(this, request, parent, ...args);
};
function proibido(valor) {
  if (typeof valor !== 'string' && !Buffer.isBuffer(valor) && !(valor instanceof URL)) return false;
  const nome = String(valor).replace(/\\/g, '/');
  return /(?:^|\/)\.env(?:\.|$)/i.test(nome) || /(?:^|\/)uploads(?:\/|$)/i.test(nome) || /\.pdf$/i.test(nome);
}
for (const nome of ['readFileSync', 'writeFileSync', 'appendFileSync', 'unlinkSync', 'renameSync', 'copyFileSync', 'mkdirSync', 'openSync', 'statSync', 'lstatSync', 'realpathSync', 'existsSync', 'createReadStream', 'createWriteStream']) {
  const original = fs[nome];
  if (typeof original !== 'function') continue;
  fs[nome] = function (...args) {
    if (proibido(args[0]) || ((nome === 'renameSync' || nome === 'copyFileSync') && proibido(args[1]))) throw new Error('Arquivo real de evidência/.env proibido nos testes');
    return original.apply(this, args);
  };
}
for (const nome of ['readFile', 'writeFile', 'appendFile', 'unlink', 'rename', 'copyFile', 'mkdir', 'open', 'stat', 'lstat', 'realpath']) {
  const callbackOriginal = fs[nome];
  if (typeof callbackOriginal === 'function') fs[nome] = function (...args) {
    if (proibido(args[0]) || ((nome === 'rename' || nome === 'copyFile') && proibido(args[1]))) throw new Error('Arquivo real de evidência/.env proibido nos testes');
    return callbackOriginal.apply(this, args);
  };
  const original = fs.promises[nome];
  fs.promises[nome] = async function (...args) {
    if (proibido(args[0]) || ((nome === 'rename' || nome === 'copyFile') && proibido(args[1]))) throw new Error('Arquivo real de evidência/.env proibido nos testes');
    return original.apply(this, args);
  };
}
