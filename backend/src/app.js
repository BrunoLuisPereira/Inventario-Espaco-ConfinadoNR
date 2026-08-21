const express = require("express");
const cors = require("cors");
const pool = require("./config/database");
const usuarioRoutes = require("./routes/usuarioRoutes");
const authRoutes = require("./routes/authRoutes");
const campanhaRoutes = require("./routes/campanhaRoutes");

const app = express();

app.use(express.json());
app.use(cors());

app.use("/api/auth", authRoutes);
app.use("/api/usuarios", usuarioRoutes);
app.use("/api/campanhas", campanhaRoutes);

app.get("/", (req, res) => {
  res.status(200).json({
    message: "API do Inventário de Espaços Confinados",
  });
});

app.get("/api/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    message: "API funcionando corretamente",
    timestamp: new Date().toISOString(),
  });
});

app.get("/api/database/health", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT NOW() AS horario_banco, current_database() AS banco"
    );

    return res.status(200).json({
      status: "ok",
      message: "PostgreSQL conectado corretamente",
      database: result.rows[0].banco,
      timestamp: result.rows[0].horario_banco,
    });
  } catch (error) {
    console.error("Erro ao testar conexão com o banco:", error);

    return res.status(500).json({
      status: "error",
      message: "Não foi possível conectar ao PostgreSQL",
    });
  }
});

module.exports = app;