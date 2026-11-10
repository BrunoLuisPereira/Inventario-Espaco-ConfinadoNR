export function selecionarGeracaoPdf(resposta, idRelatorio, idioma) {
  const geracoes = resposta?.data?.geracoes
  if (!Array.isArray(geracoes)) return null
  const documento = geracoes.find(g => g && String(g.id_relatorio) === String(idRelatorio) &&
    g.idioma === idioma && typeof g.id_geracao === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(g.id_geracao))
  return documento || null
}
