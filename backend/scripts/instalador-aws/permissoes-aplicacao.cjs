'use strict';

function gerarPermissoesAplicacao() {
  return `
-- Permissoes operacionais da aplicacao.
-- Executar somente apos a criacao das tabelas.

GRANT USAGE ON SCHEMA public TO nr33_hml_app;

GRANT SELECT, INSERT, UPDATE, DELETE
ON ALL TABLES IN SCHEMA public
TO nr33_hml_app;

GRANT USAGE, SELECT
ON ALL SEQUENCES IN SCHEMA public
TO nr33_hml_app;

-- Auditoria: leitura permitida, escrita direta proibida.
REVOKE INSERT, UPDATE, DELETE
ON public.auditoria_perfil_usuario
FROM nr33_hml_app;

REVOKE ALL
ON SEQUENCE public.auditoria_perfil_usuario_id_auditoria_seq
FROM nr33_hml_app;
`;
}

module.exports = { gerarPermissoesAplicacao };
