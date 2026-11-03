export const camposCaracterizacao = [
  { nome: 'codigo_identificacao', rotulo: 'Item A — Código de identificação/rastreio', limite: 150 },
  { nome: 'volume_m3', rotulo: 'Item B — Volume (m³)', tipo: 'number', passo: '0.000001', minimo: '0.000001' },
  { nome: 'quantidade_aberturas', rotulo: 'Item C — Quantidade de aberturas e bocas de visita', tipo: 'number', passo: '1', minimo: '0', maximo: '2147483647' },
  { nome: 'dimensoes_aberturas', rotulo: 'Item C — Dimensões das aberturas e bocas de visita', limite: 5000, linhas: 4,
    exemplo: 'BM-01: circular, Ø 600 mm; BM-02: retangular, 800 × 600 mm. Descreva cada abertura em uma linha.' },
  { nome: 'formas_acesso', rotulo: 'Item D — Formas de acesso e respectivas dimensões', limite: 5000, linhas: 4,
    exemplo: 'Descreva escadas, entradas superiores ou laterais e suas dimensões.' },
  { nome: 'geometria', rotulo: 'Item D — Geometria do espaço confinado', limite: 2000, linhas: 4 },
  { nome: 'utilizacao_produto', rotulo: 'Item G — Utilização do espaço e/ou produto armazenado', limite: 5000, linhas: 5 },
  { nome: 'perigos_antes_liberacao', rotulo: 'Item G — Possíveis perigos antes da liberação de entrada', limite: 5000, linhas: 5 },
]

export function preencherCaracterizacao(dados = {}) {
  return Object.fromEntries(camposCaracterizacao.map(({ nome }) => [nome, dados[nome] ?? '']))
}

export function validarCaracterizacao(dados) {
  for (const { nome, rotulo, limite } of camposCaracterizacao) {
    const texto = String(dados[nome] ?? '').trim()
    if (!texto) continue
    if (limite && [...texto].length > limite) return `${rotulo}: máximo de ${limite} caracteres.`
    if (nome === 'volume_m3' && (!/^\d{1,12}(?:\.\d{1,6})?$/.test(texto) || Number(texto) <= 0)) {
      return 'O volume deve ser maior que zero, com até 12 dígitos inteiros e 6 casas decimais.'
    }
    if (nome === 'quantidade_aberturas' && (!/^\d+$/.test(texto) || Number(texto) > 2147483647)) {
      return 'A quantidade de aberturas deve ser um inteiro entre 0 e 2147483647.'
    }
  }
  return ''
}

export function prepararCaracterizacao(dados) {
  return Object.fromEntries(camposCaracterizacao.map(({ nome }) => {
    const texto = String(dados[nome] ?? '').trim()
    return [nome, texto === '' ? null : nome === 'quantidade_aberturas' ? Number(texto) : texto]
  }))
}
