import test from 'node:test'
import assert from 'node:assert/strict'
import { criarI18n, normalizarIdioma, recursos, acompanharIdiomaHtml } from '../src/i18n/index.js'

test('inicializa em português, independentemente do idioma do navegador', () => {
  const i18n = criarI18n()
  assert.equal(i18n.isInitialized, true)
  assert.equal(i18n.resolvedLanguage, 'pt-BR')
  assert.equal(i18n.t('settings:title'), 'Configurações')
  assert.equal(i18n.t('campaigns'), 'Campanhas')
})

test('idiomas não suportados usam português', async () => {
  for (const idioma of [undefined, null, '', 'pt', 'en-US', 'fr', {}, ['en']]) {
    assert.equal(normalizarIdioma(idioma), 'pt-BR')
    assert.equal(criarI18n(idioma).resolvedLanguage, 'pt-BR')
  }
  const i18n = criarI18n('en')
  await i18n.changeLanguage('fr')
  assert.equal(i18n.t('settings:title'), 'Configurações')
})

test('chave ausente em inglês usa o catálogo português', () => {
  const i18n = criarI18n('en')
  // Recurso exclusivo da instância, sem modificar os catálogos compartilhados.
  i18n.addResourceBundle('pt-BR', 'fallback-test', { onlyPortuguese: 'Texto de reserva' })
  assert.equal(i18n.t('onlyPortuguese', { ns: 'fallback-test' }), 'Texto de reserva')
})

test('troca dinâmica atualiza traduções e lang do HTML; inscrição pode ser removida', async () => {
  const i18n = criarI18n()
  const documento = { documentElement: { lang: 'en' } }
  const remover = acompanharIdiomaHtml(i18n, documento)
  assert.equal(documento.documentElement.lang, 'pt-BR')
  await i18n.changeLanguage('en')
  assert.equal(i18n.t('settings:title'), 'Settings')
  assert.equal(i18n.t('campaigns'), 'Campaigns')
  assert.equal(documento.documentElement.lang, 'en')
  await i18n.changeLanguage('pt-BR')
  assert.equal(i18n.t('settings:title'), 'Configurações')
  assert.equal(documento.documentElement.lang, 'pt-BR')
  remover()
  await i18n.changeLanguage('en')
  assert.equal(documento.documentElement.lang, 'pt-BR')
  assert.equal(criarI18n().resolvedLanguage, 'pt-BR', 'nova inicialização não persiste escolha anterior')
})

test('catálogos possuem os mesmos domínios, chaves, valores e parâmetros válidos', () => {
  assert.deepEqual(Object.keys(recursos).sort(), ['en', 'pt-BR'])
  const dominios = Object.keys(recursos['pt-BR']).sort()
  assert.deepEqual(Object.keys(recursos.en).sort(), dominios)
  const parametros = texto => [...texto.matchAll(/{{\s*([^}]+?)\s*}}/g)].map(m => m[1]).sort()
  for (const dominio of dominios) {
    const pt = recursos['pt-BR'][dominio], en = recursos.en[dominio]
    assert.deepEqual(Object.keys(pt).sort(), Object.keys(en).sort(), dominio)
    for (const chave of Object.keys(pt)) {
      for (const valor of [pt[chave], en[chave]]) {
        assert.equal(typeof valor, 'string')
        assert.ok(valor.trim(), `${dominio}:${chave} vazio`)
        assert.doesNotMatch(valor, /\uFFFD|\?{2,}/, `${dominio}:${chave} com codificação inválida`)
      }
      assert.deepEqual(parametros(pt[chave]), parametros(en[chave]), `${dominio}:${chave}`)
    }
  }
})
