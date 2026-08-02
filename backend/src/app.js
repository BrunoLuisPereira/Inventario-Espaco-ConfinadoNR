const express = require("express");
const cors = require("cors");

const app = express();

// Permite que a API receba JSON.
app.use(express.json());

// Permitirá futuramente a comunicação com o frontend.
app.use(cors());

// Rota inicial de teste.
app.get("/", (req, res) => {
  res.status(200).json({
    message: "API do Inventário de Espaços Confinados",
  });
});

// Verificação de funcionamento da API.
app.get("/api/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    message: "API funcionando corretamente",
    timestamp: new Date().toISOString(),
  });
});

module.exports = app;