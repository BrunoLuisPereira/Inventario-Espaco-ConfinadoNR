const express = require("express");
const path = require("path");

const authRoutes = require("./routes/authRoutes");
const usuarioRoutes = require("./routes/usuarioRoutes");
const campanhaRoutes = require("./routes/campanhaRoutes");
const localRoutes = require("./routes/localRoutes");
const checklistRoutes = require("./routes/checklistRoutes");
const evidenciaRoutes = require("./routes/evidenciaRoutes");

const app = express();


// ======================================================
// Middlewares gerais
// ======================================================

app.use(express.json());

app.use(
  express.urlencoded({
    extended: true,
  })
);


// ======================================================
// Rota inicial
// ======================================================

app.get("/", (req, res) => {
  return res.status(200).json({
    status: "success",
    message: "API do Inventário de Espaços Confinados funcionando.",
  });
});


// ======================================================
// Health check da API
// ======================================================

app.get("/api/health", (req, res) => {
  return res.status(200).json({
    status: "success",
    message: "API funcionando corretamente.",
  });
});


// ======================================================
// Rotas da aplicação
// ======================================================

app.use("/api/auth", authRoutes);

app.use("/api/usuarios", usuarioRoutes);

app.use("/api/campanhas", campanhaRoutes);

app.use("/api/locais", localRoutes);

app.use("/api/checklists", checklistRoutes);

app.use("/api/evidencias", evidenciaRoutes);


// ======================================================
// Rota não encontrada
// ======================================================

app.use((req, res, next) => {
  const erro = new Error(
    `Rota não encontrada: ${req.method} ${req.originalUrl}`
  );

  erro.statusCode = 404;

  next(erro);
});


// ======================================================
// Middleware global de tratamento de erros
// IMPORTANTE: deve ficar por último
// ======================================================

app.use((erro, req, res, next) => {
  console.error(erro);

  let statusCode =
    erro.statusCode ||
    erro.status ||
    500;

  let mensagem =
    erro.message ||
    "Erro interno do servidor.";


  // ==================================================
  // Erros específicos do Multer
  // ==================================================

  if (erro.code === "LIMIT_FILE_SIZE") {
    statusCode = 400;

    mensagem =
      "Arquivo muito grande. O tamanho máximo permitido é 10 MB.";
  }

  if (erro.code === "LIMIT_UNEXPECTED_FILE") {
    statusCode = 400;

    mensagem =
      "Campo de arquivo inválido. Utilize o campo 'arquivo'.";
  }


  // ==================================================
  // Erros do PostgreSQL
  // ==================================================

  if (erro.code === "23505") {
    statusCode = 409;

    mensagem =
      "Já existe um registro com esses dados.";
  }

  if (erro.code === "23503") {
    statusCode = 400;

    mensagem =
      "Não foi possível realizar a operação devido a um relacionamento inválido.";
  }

  if (erro.code === "23514") {
    statusCode = 400;

    mensagem =
      "Um dos valores informados não atende às regras permitidas.";
  }


  // ==================================================
  // Resposta padronizada
  // ==================================================

  return res.status(statusCode).json({
    status: "error",
    message: mensagem,
  });
});


module.exports = app;