// Apenas fixtures locais e geração em buffer: não importa pool, serviços de
// autenticação, .env ou utilitário de persistência da aplicação.
const fs = require('node:fs/promises');
const path = require('node:path');
const { gerarPdfRelatorio } = require('../src/services/pdfService');
const { dados, imagem } = require('../tests/helpers/pdfNr33Fixture.cjs');
async function main() {
  if (!process.argv[2]) throw new Error('Informe um diretório de saída para as amostras sintéticas.');
  const destino = path.resolve(process.argv[2]);
  await fs.mkdir(destino, { recursive: true });
  const d = dados();
  const imagens = new Map([[1, imagem(1000, 600)], [2, imagem(400, 800)]]);
  const buffer = await gerarPdfRelatorio(d, { somenteBuffer: true, imagens });
  await fs.writeFile(path.join(destino, 'nr33-corporativo-sintetico.pdf'), buffer, { flag: 'wx' });
  d.evidencias.push({ ...d.evidencias[0], id_evidencia: 2, descricao: 'Ilustração sintética vertical.\n' + 'Observação extensa de homologação. '.repeat(180) });
  d.observacoes_checklist = 'Observações completas preservadas. '.repeat(160);
  await fs.writeFile(path.join(destino, 'nr33-corporativo-extenso.pdf'), await gerarPdfRelatorio(d, { somenteBuffer: true, imagens }), { flag: 'wx' });
  console.log('Amostras exclusivamente sintéticas geradas em: ' + destino);
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
