const multer = require("multer");
const path = require("path");
const fs = require("fs");

const pastaUploads = path.join(
  __dirname,
  "../../uploads/evidencias"
);

if (!fs.existsSync(pastaUploads)) {
  fs.mkdirSync(pastaUploads, {
    recursive: true,
  });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, pastaUploads);
  },

  filename: (req, file, cb) => {
    const extensao = path.extname(file.originalname);

    const nomeArquivo = `${Date.now()}-${Math.round(
      Math.random() * 1e9
    )}${extensao}`;

    cb(null, nomeArquivo);
  },
});

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
  },
});

module.exports = {
  uploadEvidencia,
};