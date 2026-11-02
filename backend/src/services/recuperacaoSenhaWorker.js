const { servico } = require('./recuperacaoSenhaService');
const { repository } = require('../repositories/recuperacaoSenhaRepository');
function iniciarWorker({ service = servico, repo = repository, intervalo = 1000 } = {}) {
  let encerrado = false, timer, atual;
  async function ciclo() {
    try {
      await service.processarProximo();
      await repo.limpar();
    } catch {
      // Não registra conteúdo, destinatário, token ou erro do provedor/driver.
      // Reserva de dois minutos permite retomar trabalho após queda.
    } finally {
      if (!encerrado) { timer = setTimeout(agendar, intervalo); timer.unref(); }
    }
  }
  function agendar() { atual = ciclo(); }
  agendar();
  return async function parar() { encerrado = true; clearTimeout(timer); await atual; };
}
module.exports = { iniciarWorker };
