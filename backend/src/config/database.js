const { Pool } = require("pg");

const pool = new Pool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    connectionTimeoutMillis: 5000,
});

pool.on("connect", () => {
    console.log("✅ Conectado ao PostgreSQL");
});

pool.on("error", () => {
    console.error("Erro na conexão com PostgreSQL.");
});

module.exports = pool;
