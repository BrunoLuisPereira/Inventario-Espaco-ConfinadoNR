const fs = require('node:fs');
const path = require('node:path');
const { destino } = require('./config.cjs');
const arquivos = ['000_baseline_homolog_observado.sql', '020_multi_tenant_ambientes_convites.sql', '021_multi_tenant_versionamento.sql'];
function montarSQL(banco, fontes) {
  destino(banco);
  if (!Array.isArray(fontes) || fontes.length !== arquivos.length) throw Error('Tres fontes revisadas obrigatorias.');
  const corpos = fontes.map(texto => {
    const m = /^((?:\s|--[^\r\n]*(?:\r?\n|$))*)BEGIN;([\s\S]*)COMMIT;\s*$/.exec(texto);
    if (!m || !texto.includes("current_setting('nr33.laboratorio', true)") || !texto.includes('EM CONSTRUCAO')) throw Error('Delimitadores ou guardas SQL invalidos.');
    if (/\b(?:CREATE|DROP|ALTER)\s+DATABASE\b|^\s*\\(?:connect|i|include)\b/im.test(texto)) throw Error('Operacao externa ao banco autorizado proibida.');
    return m[2];
  });
  return `BEGIN;\nDO $destino$ BEGIN IF current_database() <> '${banco}' THEN RAISE EXCEPTION 'Banco de destino divergente.'; END IF; END; $destino$;\n${corpos.join('\n')}\nCOMMIT;\n`;
}
if (require.main === module) {
  if (process.argv[2] !== '--banco' || process.argv.length !== 4) throw Error('Informe --banco com o destino aprovado.');
  const fontes = arquivos.map(a => fs.readFileSync(path.resolve(__dirname, '../database', a), 'utf8'));
  process.stdout.write(montarSQL(process.argv[3], fontes));
}
module.exports = { montarSQL, arquivos };
