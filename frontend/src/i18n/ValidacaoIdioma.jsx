import { useContext, useEffect } from 'react'
import { I18nContext } from 'react-i18next'
import { traduzir } from './apresentacao.js'
import { i18n as instanciaPadrao } from './index.js'

function mensagemValidacaoNativa(validade) {
  if (validade.valueMissing) return traduzir('Preencha este campo.')
  if (validade.typeMismatch) return traduzir('Informe um e-mail válido.')
  if (validade.patternMismatch) return traduzir('Confira o formato deste campo.')
  if (validade.tooShort || validade.tooLong) return traduzir('Confira o tamanho permitido para este campo.')
  if (validade.rangeUnderflow || validade.rangeOverflow || validade.stepMismatch) return traduzir('Confira o valor mínimo, máximo e o intervalo permitido.')
  if (validade.badInput) return traduzir('Confira o valor informado.')
  return ''
}

export default function ValidacaoIdioma() {
  // Usa a instância estável do provider: o hook de tradução troca seu wrapper
  // ao mudar o idioma, o que não deve apagar mensagens nativas já visíveis.
  const contexto = useContext(I18nContext)
  const i18n = contexto?.i18n || instanciaPadrao
  useEffect(() => {
    const campos = new Set()
    const aplicar = campo => {
      if (!campo?.validity || campo.validity.customError && !campos.has(campo)) return
      campo.setCustomValidity('')
      campo.setCustomValidity(mensagemValidacaoNativa(campo.validity))
      campos.add(campo)
    }
    const invalidar = evento => aplicar(evento.target)
    const limpar = evento => {
      if (campos.has(evento.target)) { evento.target.setCustomValidity(''); campos.delete(evento.target) }
    }
    const idiomaAlterado = () => campos.forEach(campo => {
      if (campo.isConnected) aplicar(campo)
      else campos.delete(campo)
    })
    document.addEventListener('invalid', invalidar, true)
    document.addEventListener('input', limpar, true)
    document.addEventListener('change', limpar, true)
    i18n.on('languageChanged', idiomaAlterado)
    return () => {
      document.removeEventListener('invalid', invalidar, true)
      document.removeEventListener('input', limpar, true)
      document.removeEventListener('change', limpar, true)
      i18n.off('languageChanged', idiomaAlterado)
      campos.forEach(campo => campo.setCustomValidity(''))
    }
  }, [i18n])
  return null
}
