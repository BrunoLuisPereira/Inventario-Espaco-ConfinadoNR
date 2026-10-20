// Gera somente DDL revisado; nunca conecta ao PostgreSQL.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const esperado = 'FA133C8B3DCBFC9851BE023E64C3125FE06E8733B4E693FA54C1BFC0F86F01F3';
const guard = `DO $seguranca$
BEGIN
  IF current_database() !~ '^nr33_lab_[0-9]{8}_[a-f0-9]{6}$'
     OR current_setting('nr33.laboratorio', true) IS DISTINCT FROM 'passo702' THEN
    RAISE EXCEPTION 'Execucao restrita ao laboratorio descartavel autorizado.';
  END IF;
END;
$seguranca$;`;
function derivar(texto) {
  if (crypto.createHash('sha256').update(texto).digest('hex').toUpperCase() !== esperado) throw Error('Hash do snapshot divergente.');
  const tabelas = texto.match(/^CREATE TABLE\s+[^;]+;/gms) || [];
  const ids = texto.match(/^ALTER TABLE\s+public\.\w+\s+ALTER COLUMN\s+\w+\s+ADD GENERATED.*?;/gms) || [];
  const constraints = texto.match(/^ALTER TABLE ONLY\s+[^;]+;/gms) || [];
  const indices = texto.match(/^CREATE UNIQUE INDEX[^;]+;/gm) || [];
  const triggers = texto.match(/^CREATE TRIGGER[^;]+;/gm) || [];
  const funcao = texto.match(/CREATE FUNCTION public\.atualizar_versao_entidade\(\).*?AS (\$\w*\$).*?\1;/s)?.[0];
  if (tabelas.length !== 9 || ids.length !== 9 || triggers.length !== 5 || indices.length !== 3 || !funcao || constraints.length !== 26) throw Error('Inventario estrutural inesperado.');
  return `-- BASELINE OBSERVADO: PostgreSQL 17.10, estrutura de homologacao; nao e DDL original.
-- EM CONSTRUCAO - NAO EXECUTAR sem homologacao e autorizacao especifica do destino.
-- Fonte SHA256 ${esperado}.
-- Objetos selecionados e reordenados; sem dump bruto, dados, ACL, owners ou configuracoes da fonte.
-- Nao reaplicar 004-019. Default de campanha corrigido para EM ANDAMENTO.
BEGIN;
${guard}
SET LOCAL check_function_bodies = false;
${tabelas.join('\n\n').replace("DEFAULT 'ATIVA'::character varying", "DEFAULT 'EM ANDAMENTO'::character varying")}
${ids.join('\n\n')}
${constraints.join('\n\n')}
${indices.join('\n\n')}
${funcao}
${triggers.join('\n\n')}
COMMIT;
`;
}
if (require.main === module) {
  const origem = path.join(process.env.LOCALAPPDATA, 'NR33-DDL-Privado/homolog_schema_20261018_124348.sql');
  const destino = path.resolve(__dirname, '../database/000_baseline_homolog_observado.sql');
  fs.writeFileSync(destino, derivar(fs.readFileSync(origem, 'utf8')), { flag: 'wx' });
  console.log('Baseline revisado gerado; nenhum SQL executado.');
}
module.exports = { derivar, guard };
