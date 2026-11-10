// Apenas fixtures sintéticas e PDFKit; não carrega servidor, dotenv ou PostgreSQL.
const fs = require('node:fs/promises');
const path = require('node:path');
const { gerarPdfRelatorio } = require('../src/services/pdfService');
const fixture = require('../tests/helpers/pdfNr33Fixture.cjs');

async function main() {
  const pasta = path.resolve(__dirname, '../../artifacts/passo4-pdf-i18n');
  await fs.mkdir(pasta, { recursive: true });
  for (const idioma of ['pt-BR', 'en']) for (const variante of ['completo', 'extenso', 'incompleto']) {
    const dados = { ...fixture.dados(), ...fixture.caracterizacao(),
      oxigenio: '20.123456', temperatura: '-0.000123', volume_m3: '999999999999.123456' };
    if (variante === 'extenso') {
      dados.descricao_local = 'Texto livre original preservado. '.repeat(200);
      dados.evidencias[0].descricao = 'Legenda extensa em português preservada. '.repeat(160);
    }
    if (variante === 'incompleto') { delete dados.id_checklist; delete dados.id_dados; dados.evidencias = []; }
    const buffer = await gerarPdfRelatorio(dados, { idioma, somenteBuffer: true,
      imagens: new Map([[1, fixture.imagem(900, 520)]]) });
    const arquivo = path.join(pasta, `${variante}-${idioma}.pdf`);
    await fs.writeFile(arquivo, buffer, { flag: process.argv.includes('--atualizar') ? 'w' : 'wx' });
    console.log(path.relative(path.resolve(__dirname, '../..'), arquivo));
  }
}
main().catch(() => { console.error('Falha ao gerar amostras sintéticas. Nenhum banco foi acessado.'); process.exitCode = 1; });
