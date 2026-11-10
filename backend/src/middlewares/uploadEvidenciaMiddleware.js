const multer = require("multer");
const { Transform } = require("node:stream");
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

const parser = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 1,
    fields: 20,
    fieldSize: 64 * 1024,
    // Busboy sinaliza partsLimit ao atingir o limite: 21 partes são aceitas.
    parts: 22,
  },
});

const MAX_CORPO = 12 * 1024 * 1024;
const ativosPorUsuario = new Map();
let ativos = 0;
const falha = (statusCode, message) => Object.assign(new Error(message), { statusCode });

// A reserva cobre o recebimento e todo o uso do buffer pelo controller.
// Eventos de resposta cancelam o fluxo, mas uma escrita em curso mantém a vaga
// até devolver o arquivo; não se anuncia memória livre enquanto o I/O a retém.
const uploadEvidencia = {
  single(campo) {
    const receber = parser.single(campo);
    return (req, res, next) => {
      const chave = req.usuario && JSON.stringify([req.usuario.id_ambiente, req.usuario.id_usuario]);
      const porUsuario = chave ? ativosPorUsuario.get(chave) || 0 : 0;
      const tamanho = req.headers['content-length'];
      if (tamanho !== undefined && (!/^\d+$/.test(tamanho) || !Number.isSafeInteger(Number(tamanho)))) {
        return next(falha(400, 'Tamanho da requisição inválido.'));
      }
      if (Number(tamanho) > MAX_CORPO) return next(falha(413, 'Upload excede o limite total de 12 MiB.'));
      if (ativos >= 4 || porUsuario >= 2) return next(falha(429, 'Uploads simultâneos excedidos. Tente novamente.'));
      ativos++;
      if (chave) ativosPorUsuario.set(chave, porUsuario + 1);
      let bytes = 0;
      let recebido = false;
      let liberado = false;
      let cancelado = false;
      let emUso = 0;
      const entrada = new Transform({
        transform(chunk, encoding, callback) {
          bytes += chunk.length;
          callback(bytes > MAX_CORPO ? falha(413, 'Upload excede o limite total de 12 MiB.') : null,
            bytes > MAX_CORPO ? undefined : chunk);
        },
      });
      // type-is exige enquadramento mesmo em streams sintéticos sem tamanho.
      entrada.headers = { ...req.headers, 'transfer-encoding': 'chunked' };
      const liberar = () => {
        if (liberado || !recebido || emUso) return;
        liberado = true;
        clearTimeout(prazo);
        req.unpipe(entrada);
        req.removeListener('aborted', interromper);
        req.removeListener('error', interromper);
        req.removeListener('close', fechar);
        for (const evento of ['finish', 'close', 'error']) res.removeListener?.(evento, encerrarResposta);
        if (req.file) delete req.file.buffer;
        if (entrada.file) delete entrada.file.buffer;
        delete req.file;
        delete entrada.file;
        ativos--;
        if (chave) {
          const restantes = ativosPorUsuario.get(chave) - 1;
          if (restantes) ativosPorUsuario.set(chave, restantes);
          else ativosPorUsuario.delete(chave);
        }
      };
      const cancelar = (erro) => {
        cancelado = true;
        if (!recebido) entrada.destroy(erro);
        else liberar();
      };
      const interromper = () => cancelar(falha(400, 'Upload interrompido.'));
      const fechar = () => { if (!req.readableEnded) interromper(); };
      const encerrarResposta = () => interromper();
      const prazo = setTimeout(() => {
        const jaEntregue = recebido;
        cancelar(falha(408, 'Tempo de upload excedido.'));
        if (jaEntregue && !res.headersSent && !res.destroyed && res.status && res.json) {
          res.status(408).json({ status: 'error', message: 'Tempo de upload excedido.' });
        }
      }, 60000);
      prazo.unref();
      req.uploadEvidenciaRecursos = {
        get cancelado() { return cancelado; },
        finalizar: liberar,
        async usarArquivo(executar) {
          if (cancelado || liberado || !req.file) throw falha(400, 'Upload interrompido.');
          emUso++;
          try { return await executar(req.file); }
          finally { emUso--; liberar(); }
        },
      };
      const concluir = (erro) => {
        if (recebido) return;
        recebido = true;
        req.unpipe(entrada);
        if (!erro) {
          req.body = entrada.body;
          req.file = entrada.file;
        } else {
          delete req.file;
          if (['LIMIT_PART_COUNT', 'LIMIT_FIELD_COUNT', 'LIMIT_FIELD_VALUE', 'LIMIT_FILE_COUNT'].includes(erro.code)) {
            erro.statusCode = 400;
          }
          liberar();
        }
        entrada.destroy();
        next(erro);
      };
      req.once('aborted', interromper);
      req.once('error', interromper);
      req.once('close', fechar);
      for (const evento of ['finish', 'close', 'error']) res.once?.(evento, encerrarResposta);
      receber(entrada, res, concluir);
      if (!recebido) req.pipe(entrada);
    };
  },
};

module.exports = {
  uploadEvidencia,
};
