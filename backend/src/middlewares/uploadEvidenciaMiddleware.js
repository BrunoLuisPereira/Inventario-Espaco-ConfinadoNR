const multer = require("multer");
// Recebe no máximo 10 MiB em memória: nenhuma gravação ocorre antes da
// validação do conteúdo, do local e da autorização no controller/service.
const storage = multer.memoryStorage();

const tiposPermitidos = [
  "image/jpeg",
  "image/png",
  "application/pdf",
];

const fileFilter = (req, file, cb) => {
  if (tiposPermitidos.includes(file.mimetype)) {
    cb(null, true);
  } else {
    const erro = new Error(
      "Tipo de arquivo não permitido. Use JPG, PNG ou PDF."
    );

    erro.statusCode = 400;
    cb(erro);
  }
};

const uploadEvidencia = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 1,
    fields: 20,
    fieldSize: 64 * 1024,
  },
});

module.exports = {
  uploadEvidencia,
};
