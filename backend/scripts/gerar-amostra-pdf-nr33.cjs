// Apenas fixtures locais e geração em buffer: não importa pool, serviços de
// autenticação, .env ou utilitário de persistência da aplicação.
const path = require('node:path');
const { criarSaidaSegura } = require('./amostrasPdfSaida.cjs');
const { gerarPdfRelatorio } = require('../src/services/pdfService');
const { dados, imagem } = require('../tests/helpers/pdfNr33Fixture.cjs');
// Argumentos relativos são subdiretórios desta raiz fixa, não do cwd.
const RAIZ_AMOSTRAS = path.resolve(__dirname, '../../artifacts/amostras-pdf-nr33');
async function main(argumento = process.argv[2]) {
  if (!argumento) throw new Error('Informe um subdiretório de artifacts/amostras-pdf-nr33 para as amostras sintéticas.');
  const saida = await criarSaidaSegura(RAIZ_AMOSTRAS, argumento);
  const d = dados();
  const imagens = new Map([[1, imagem(1000, 600)], [2, imagem(400, 800)]]);
  const buffer = await gerarPdfRelatorio(d, { somenteBuffer: true, imagens });
  await saida.escrever('nr33-corporativo-sintetico.pdf', buffer);
  d.evidencias.push({ ...d.evidencias[0], id_evidencia: 2, descricao: 'Ilustração sintética vertical.\n' + 'Observação extensa de homologação. '.repeat(180) });
  d.observacoes_checklist = 'Observações completas preservadas. '.repeat(160);
  await saida.escrever('nr33-corporativo-extenso.pdf', await gerarPdfRelatorio(d, { somenteBuffer: true, imagens }));
  console.log('Amostras exclusivamente sintéticas geradas em: ' + saida.destino);
}
module.exports = { main, RAIZ_AMOSTRAS };
if (require.main === module) main().catch(e => { console.error(e.message); process.exitCode = 1; });
