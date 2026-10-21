const { exportar } = require('../repositories/auditoriaExportacaoRepository');
const jwt = require('jsonwebtoken');
const normalizarId = require('../utils/normalizarIdDominio');

async function historicoCompleto(req, res) {
  const abortar = new AbortController();
  const cancelar = () => abortar.abort();
  req.once('aborted', cancelar);
  res.once('close', cancelar);
  res.once('error', cancelar);
  function validarSessao() {
    try {
      const token = req.headers.authorization.trim().split(/\s+/)[1];
      const payload = jwt.verify(token, process.env.JWT_SECRET, {
        algorithms: ['HS256'], issuer: process.env.JWT_ISSUER || 'inventario-espacos-confinados-api',
        audience: process.env.JWT_AUDIENCE || 'inventario-espacos-confinados-pwa',
      });
      if (typeof payload.sub !== 'string' || normalizarId(payload.sub) !== req.usuario.id_usuario) throw Error();
    } catch { throw Object.assign(new Error('Sessão inválida ou expirada.'), { statusCode: 401 }); }
  }
  async function escrever(frame) {
    if (abortar.signal.aborted || res.destroyed) throw Error('Conexão encerrada.');
    if (!res.write(JSON.stringify(frame) + '\n')) {
      await new Promise((resolve, reject) => {
        const limpar = () => { clearTimeout(timer); res.off('drain', drenar); res.off('close', fechar); res.off('error', fechar); };
        const drenar = () => { limpar(); resolve(); };
        const fechar = () => { limpar(); reject(Error('Conexão encerrada.')); };
        const timer = setTimeout(fechar, 20000);
        res.once('drain', drenar); res.once('close', fechar); res.once('error', fechar);
      });
    }
  }
  try {
    if (res.headersSent || res.destroyed) return;
    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    let total = 0n;
    for await (const registros of exportar(req.usuario, { signal: abortar.signal, validarSessao })) {
      await escrever({ tipo: 'lote', registros });
      total += BigInt(registros.length);
    }
    // Somente após CLOSE, autorização final e COMMIT. Não é um download CSV
    // direto: o cliente precisa validar esta confirmação e o EOF antes de salvar.
    validarSessao();
    await escrever({ tipo: 'fim', total: String(total) });
    res.end();
  } catch (e) {
    if (res.destroyed || abortar.signal.aborted) return;
    if (res.headersSent) { res.destroy(); return; }
    const status = [401, 403].includes(e?.statusCode) ? e.statusCode : 500;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(status).json({ status: 'error', message: status === 500 ? 'Não foi possível exportar o histórico.' : status === 401 ? 'Sessão inválida ou expirada.' : 'Você não possui permissão para esta operação.' });
  } finally {
    req.off('aborted', cancelar); res.off('close', cancelar); res.off('error', cancelar);
  }
}
module.exports = { historicoCompleto };
