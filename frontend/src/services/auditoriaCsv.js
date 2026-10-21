import { nomesPerfis } from './permissoes.js'

function celula(valor) {
  let texto = String(valor ?? '')
  // Aspas CSV não impedem fórmulas no Excel. Neutraliza também prefixos
  // com espaços/controles e variantes de largura completa, sem avaliar conteúdo.
  const inicioSemControles = texto.replace(/^[\s\p{Cc}]*/u, '')
  if (/^[=+\-@＝＋－＠]/u.test(inicioSemControles) || /^[\t\r\n]/.test(texto)) texto = "'" + texto
  return '"' + texto.replaceAll('"', '""') + '"'
}

export function gerarCsvAuditoria(registros, usuarios) {
  if (!Array.isArray(registros) || registros.length > 200 || !Array.isArray(usuarios)) {
    throw Error('Resposta de auditoria inválida para exportação.')
  }
  const nomes = new Map(usuarios.map(u => [String(u.id_usuario), u.nome]))
  const nome = id => nomes.get(String(id)) || `Usuário #${id}`
  const linhas = [['Usuário', 'Perfil anterior', 'Novo perfil', 'Responsável', 'Data', 'Hora']]
  for (const registro of registros) {
    const data = typeof registro.data_hora === 'string' && registro.data_hora.trim() ? new Date(registro.data_hora) : new Date(NaN)
    if (!Number.isFinite(data.getTime())) throw Error('Data de auditoria inválida para exportação.')
    linhas.push([
      nome(registro.id_usuario_afetado), nomesPerfis[registro.perfil_anterior] || registro.perfil_anterior,
      nomesPerfis[registro.perfil_novo] || registro.perfil_novo, nome(registro.id_usuario_responsavel),
      data.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }),
      data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }),
    ])
  }
  return '\uFEFF' + linhas.map(linha => linha.map(celula).join(';')).join('\r\n') + '\r\n'
}

export function nomeArquivoAuditoria(data = new Date()) {
  const dia = [data.getFullYear(), String(data.getMonth() + 1).padStart(2, '0'), String(data.getDate()).padStart(2, '0')].join('-')
  return `auditoria_permissoes_ultimas_200_${dia}.csv`
}
