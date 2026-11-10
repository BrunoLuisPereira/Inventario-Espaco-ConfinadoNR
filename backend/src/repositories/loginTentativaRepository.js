// Adaptador da aplicação. O laboratório importa somente a fábrica sem I/O.
const pool = require('../config/database');
const { criarLoginTentativaRepository } = require('./loginTentativaRepositoryFactory');

module.exports = criarLoginTentativaRepository(pool);
