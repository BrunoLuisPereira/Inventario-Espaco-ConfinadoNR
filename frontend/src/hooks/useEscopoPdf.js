import { useEffect, useMemo, useRef } from 'react'
import { useAuth } from './useAuth.js'
import { useIdioma } from './useIdioma.js'
import { sessaoAtual } from '../services/sessao.js'
import { i18n } from '../i18n/index.js'

// Inclui token para invalidar também logout/login da mesma conta.
export function useEscopoPdf() {
  const { token, usuario } = useAuth()
  const { idioma } = useIdioma()
  const escopo = useMemo(() => ({ token, idUsuario: usuario?.id_usuario, idAmbiente: usuario?.id_ambiente, idioma }),
    [token, usuario?.id_usuario, usuario?.id_ambiente, idioma])
  const ativo = useRef(escopo)
  useEffect(() => {
    ativo.current = escopo
    return () => { if (ativo.current === escopo) ativo.current = null }
  }, [escopo])
  const atual = () => {
    const sessao = sessaoAtual().ler()
    return ativo.current === escopo && sessao.token === token &&
      String(sessao.usuario?.id_usuario) === String(escopo.idUsuario) &&
      sessao.usuario?.id_ambiente === escopo.idAmbiente && i18n.resolvedLanguage === idioma
  }
  return { escopo, atual, idioma }
}
