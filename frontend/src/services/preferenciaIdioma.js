import { normalizarIdioma } from '../i18n/index.js'

export function escopoIdioma(sessao) {
  const u = sessao?.usuario
  return sessao?.token && /^[1-9]\d*$/.test(String(u?.id_usuario)) &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(u?.id_ambiente)
    ? `${u.id_ambiente.toLowerCase()}:${u.id_usuario}` : null
}

export function capturarConsultaIdioma(storage, sessao, prefixo = 'nr33:idioma:v1:') {
  const escopo = escopoIdioma(sessao)
  let revisao = null
  try { revisao = JSON.parse(storage.getItem(prefixo + escopo) || 'null')?.revisao ?? null } catch { /* Sem cache válido. */ }
  return { token: sessao?.token, escopo, revisao }
}

// Fila exclusiva de preferência; não participa da sincronização NR-33.
export function criarPreferenciaIdioma({ storage, prefixo = 'nr33:idioma:v1:', obterSessao,
  enviar, aplicar, online = () => true, novaRevisao = () => globalThis.crypto.randomUUID() }) {
  let ativa = null
  const memoria = new Map(), ocupados = new Set()
  let estado = { pendente: false, erro: false }
  const ouvintes = new Set()
  function publicar(pendente, erro = false) {
    estado = { pendente, erro }
    ouvintes.forEach(fn => fn())
  }
  function ler(escopo) {
    try {
      const dado = JSON.parse(storage.getItem(prefixo + escopo) || 'null')
      return dado && ['pt-BR', 'en'].includes(dado.idioma) && typeof dado.revisao === 'string'
        && typeof dado.pendente === 'boolean' ? dado : memoria.get(escopo)
    } catch { return memoria.get(escopo) }
  }
  function salvar(escopo, dado) {
    memoria.set(escopo, dado)
    try { storage.setItem(prefixo + escopo, JSON.stringify(dado)) } catch { /* Mantém escolha em memória. */ }
  }
  function atual(s) {
    const agora = obterSessao()
    return ativa === s && agora?.token === s.token && escopoIdioma(agora) === s.escopo
  }
  async function sincronizar() {
    const s = ativa
    if (!s || !s.validada || !atual(s) || !online() || ocupados.has(s.escopo)) return
    const dado = ler(s.escopo)
    if (!dado?.pendente) return
    ocupados.add(s.escopo)
    let sucesso = false
    try {
      // enviar deve conferir novamente a sessão antes de iniciar o transporte.
      const resposta = await enviar(dado.idioma, s)
      if (!atual(s)) return
      const confirmado = resposta?.data
      if (String(confirmado?.id_usuario) !== s.id_usuario ||
          confirmado?.id_ambiente?.toLowerCase() !== s.id_ambiente || confirmado?.idioma !== dado.idioma) {
        throw new Error('Resposta de preferência inválida.')
      }
      sucesso = true
      const ultimo = ler(s.escopo)
      if (ultimo?.revisao === dado.revisao) {
        salvar(s.escopo, { ...ultimo, pendente: false, revisao: novaRevisao() })
        publicar(false)
      }
    } catch {
      if (atual(s)) publicar(true, true)
    } finally {
      ocupados.delete(s.escopo)
      // Uma nova edição ou sessão espera o envio anterior; falhas não causam loop.
      if (ativa && atual(ativa) && (ativa !== s || sucesso && ler(s.escopo)?.revisao !== dado.revisao)) {
        void sincronizar()
      }
    }
  }
  function ativar(sessao, validada = true, consulta) {
    const escopo = escopoIdioma(sessao)
    if (!escopo) {
      ativa = null
      aplicar('pt-BR')
      publicar(false)
      return
    }
    if (ativa?.escopo === escopo && ativa.token === sessao.token) {
      if (!validada) return
      if (ativa.validada) {
        const salvo = ler(escopo)
        // Só aceita uma revalidação iniciada após a última edição/confirmação local.
        if (!consulta || consulta.token !== ativa.token || consulta.escopo !== escopo ||
            consulta.revisao !== salvo?.revisao || salvo?.pendente) return
        const idioma = normalizarIdioma(sessao.usuario.idioma)
        if (salvo?.idioma === idioma) return
        salvar(escopo, { idioma, pendente: false, revisao: novaRevisao() })
        aplicar(idioma)
        publicar(false)
        return
      }
    }
    ativa = { escopo, token: sessao.token, id_usuario: String(sessao.usuario.id_usuario),
      id_ambiente: sessao.usuario.id_ambiente.toLowerCase(), validada }
    const salvo = ler(escopo)
    const dado = salvo && (salvo.pendente || !validada) ? salvo : { idioma: normalizarIdioma(sessao.usuario.idioma),
      pendente: false, revisao: novaRevisao() }
    salvar(escopo, dado)
    aplicar(dado.idioma)
    publicar(dado.pendente)
    void sincronizar()
  }
  function atualizarLocal() {
    if (!ativa || !atual(ativa)) { ativar(null); return }
    const dado = ler(ativa.escopo)
    if (dado) { aplicar(dado.idioma); publicar(dado.pendente) }
    void sincronizar()
  }
  function alterar(idioma) {
    if (!ativa || !atual(ativa)) return
    const dado = { idioma: normalizarIdioma(idioma), pendente: true, revisao: novaRevisao() }
    salvar(ativa.escopo, dado)
    aplicar(dado.idioma)
    publicar(true)
    void sincronizar()
  }
  return { ativar, alterar, sincronizar, atualizarLocal,
    estado: () => estado,
    assinar: fn => { ouvintes.add(fn); return () => ouvintes.delete(fn) },
  }
}
