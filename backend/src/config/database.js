const { Pool } = require("pg");

const pool = new Pool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
});

pool.on("connect", () => {
    console.log("✅ Conectado ao PostgreSQL");
});

pool.on("error", (err) => {
    console.error("Erro na conexão com PostgreSQL:", err);
});

module.exports = pool;