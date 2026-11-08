// Preload de testes: substitui a configuracao ANTES de qualquer import de service,
// repository ou controller. Nenhum pg/dotenv e carregado por este helper.
const Module = require('node:module');
const arquivo = require.resolve('../../src/config/database');
const modulo = new Module(arquivo);
modulo.filename = arquivo;
modulo.loaded = true;
modulo.exports = {
  async query() { throw new Error('Acesso a banco nao simulado proibido nesta suite.'); },
  async connect() { throw new Error('Conexao PostgreSQL proibida nesta suite.'); },
};
require.cache[arquivo] = modulo;
