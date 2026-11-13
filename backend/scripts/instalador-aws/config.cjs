'use strict';

const MIGRATIONS = Object.freeze([
  '000_baseline_homolog_observado.sql',
  '020_multi_tenant_ambientes_convites.sql',
  '021_multi_tenant_versionamento.sql',
  '022_perfis_fundador_auditoria.sql',
  '023_controle_tentativas_login.sql',
  '024_recuperacao_senha.sql',
  '025_caracterizacao_checklist_nr33.sql',
  '026_criterios_atmosfera_sinalizacao_nr33.sql',
  '027_preferencia_idioma_usuario.sql',
  '028_geracoes_pdf_idioma.sql',
]);

const BANCO_HOMOLOGACAO = 'inventario_nr33_homolog';

function validarDestino(banco, permitirHomologacao = false) {
  if (/^nr33_aws_teste_[a-z0-9_]+$/.test(banco)) {
    return 'TESTE';
  }

  if (banco === BANCO_HOMOLOGACAO && permitirHomologacao === true) {
    return 'HOMOLOGACAO';
  }

  throw new Error('Banco de destino nao autorizado para instalacao AWS.');
}

module.exports = {
  MIGRATIONS,
  BANCO_HOMOLOGACAO,
  validarDestino,
};
