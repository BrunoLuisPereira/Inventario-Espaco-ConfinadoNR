const test = require('node:test');
const assert = require('node:assert/strict');
const adaptador = require('../src/utils/adaptadorCamposNr33');
const regras = require('../src/utils/regrasCaracterizacaoNr33');
const { MARCADOR, CAMPOS_NR33, CAMPOS_ESTADO_RELEVANTE,
  selecionarCamposNr33, validarEstruturaNr33, mesclarCamposNr33,
  reconstruirAvaliacaoEspecifica, prepararDadosRegrasNr33, representarEstadoCanonicoNr33 } = adaptador;
const especificos = regras.CONDICOES_ESPECIFICAS;
const nulos = Object.fromEntries(CAMPOS_NR33.map(c => [c, null]));
const condicoes = { nao_destinado_ocupacao_humana: 'SIM', meios_limitados_entrada_saida: 'SIM',
  utilizado_armazenagem: 'SIM', potencial_engolfamento: 'NAO', potencial_afogamento: 'SIM' };
const completo = { ...nulos, ...condicoes, [MARCADOR]: true, atmosfera_oxigenio: false,
  atmosfera_contaminantes: true, atmosfera_explosiva: false, possui_placa_identificacao: false };
const criterios = { criterio_a: 'SIM', criterio_b: 'SIM', criterio_c: 'SIM', acesso_controlado: 'SIM',
  ventilacao_adequada: 'NAO', monitoramento_atmosferico: 'SIM', procedimento_emergencia: 'NAO' };

test('dez campos exatos e constantes congeladas', () => {
  assert.deepEqual(CAMPOS_NR33, [...regras.DEPENDENTES, ...especificos, 'avaliacao_especifica_iniciada']);
  assert.equal(new Set(CAMPOS_NR33).size, 10);
  assert.ok(Object.isFrozen(CAMPOS_NR33)); assert.ok(Object.isFrozen(CAMPOS_ESTADO_RELEVANTE));
  assert.deepEqual(selecionarCamposNr33(completo, { estrito: true }), completo);
});

for (const campo of CAMPOS_NR33) test(`dominio e presenca: ${campo}`, () => {
  const valores = campo === MARCADOR ? [true, null] : especificos.includes(campo) ? ['SIM', 'NAO', null] : [true, false, null];
  for (const valor of valores) assert.deepEqual(selecionarCamposNr33({ [campo]: valor }), { [campo]: valor });
  assert.deepEqual(selecionarCamposNr33({ [campo]: undefined }), {});
  assert.deepEqual(selecionarCamposNr33({}), {});
  const invalidos = campo === MARCADOR ? [false, 'true', 'SIM', 1, 0, [], {}]
    : especificos.includes(campo) ? [true, false, 0, 1, 'sim', 'NAO ', '', 'NÃO', [], {}]
      : ['true', 'false', 'SIM', 'NAO', 0, 1, '', [], {}];
  for (const valor of [...invalidos, NaN, Infinity]) assert.throws(() => selecionarCamposNr33({ [campo]: valor }), TypeError);
});

test('seletor normal projeta; estrito rejeita campos indevidos sem consultar getters', () => {
  for (const campo of ['id_usuario', 'criterio_a', 'status', 'avaliacao_nr33', 'avaliacao_especifica', 'confirmacao_limpeza', 'estranho']) {
    assert.deepEqual(selecionarCamposNr33({ ...completo, [campo]: 'forjado' }), completo);
    for (const valor of ['forjado', undefined, null]) assert.throws(() => selecionarCamposNr33({ [campo]: valor }, { estrito: true }), TypeError);
  }
  const simbolo = Symbol('fora');
  assert.throws(() => selecionarCamposNr33({ [simbolo]: true }, { estrito: true }), TypeError);
  const oculto = Object.defineProperty({}, 'fora', { value: null });
  assert.throws(() => selecionarCamposNr33(oculto, { estrito: true }), TypeError);
  const getter = Object.defineProperty({}, 'fora', { get() { throw Error('Nao executar'); } });
  assert.deepEqual(selecionarCamposNr33(getter), {});
  assert.throws(() => selecionarCamposNr33(getter, { estrito: true }), TypeError);
});

test('validacao de objetos, opcoes e acessores', () => {
  for (const valor of [null, [], true, false, 1, 'texto', new Date(), Object.create({ atmosfera_oxigenio: true })]) {
    for (const fn of [selecionarCamposNr33, validarEstruturaNr33, reconstruirAvaliacaoEspecifica, prepararDadosRegrasNr33, representarEstadoCanonicoNr33]) assert.throws(() => fn(valor), TypeError);
    assert.throws(() => mesclarCamposNr33({}, valor), TypeError);
    assert.throws(() => mesclarCamposNr33(valor, {}), TypeError);
    assert.throws(() => selecionarCamposNr33({}, valor), TypeError);
  }
  for (const estrito of [null, '', 1]) assert.throws(() => selecionarCamposNr33({}, { estrito }), TypeError);
  assert.deepEqual(selecionarCamposNr33(completo, { estrito: false }), completo);
  assert.deepEqual(selecionarCamposNr33(Object.assign(Object.create(null), { atmosfera_oxigenio: false })), { atmosfera_oxigenio: false });
  const getter = Object.defineProperty({}, 'atmosfera_oxigenio', { get() { throw Error('Nao executar'); } });
  assert.throws(() => selecionarCamposNr33(getter), TypeError);
  assert.throws(() => selecionarCamposNr33({}, Object.defineProperty({}, 'estrito', { get() { throw Error('Nao executar'); } })), TypeError);
  assert.deepEqual(selecionarCamposNr33(Object.defineProperty({}, 'atmosfera_oxigenio', { value: false })), { atmosfera_oxigenio: false });
});

test('snapshot nao iniciado e iniciado vazio preservam estados distintos das regras', () => {
  for (const estado of [{}, nulos, { [MARCADOR]: null }, { utilizado_armazenagem: null }]) {
    assert.deepEqual(validarEstruturaNr33(estado), selecionarCamposNr33(estado));
    assert.equal(reconstruirAvaliacaoEspecifica(estado), null);
    assert.equal(regras.avaliarHipoteseEspecifica(reconstruirAvaliacaoEspecifica(estado)), 'NAO_AVALIADA');
  }
  for (const estado of [{ [MARCADOR]: true }, { ...nulos, [MARCADOR]: true }]) {
    const resultado = reconstruirAvaliacaoEspecifica(estado);
    assert.deepEqual(resultado, Object.fromEntries(especificos.map(c => [c, null])));
    assert.equal(regras.avaliarHipoteseEspecifica(resultado), 'INFORMACOES_INSUFICIENTES');
  }
  assert.deepEqual(reconstruirAvaliacaoEspecifica(completo), condicoes);
});

test('presenca exige marcador afirmativo para qualquer condicao preenchida', () => {
  for (const campo of especificos) for (const valor of ['SIM', 'NAO']) for (const marcador of [undefined, null]) {
    const estado = { [campo]: valor, [MARCADOR]: marcador };
    // Patch pode depender do marcador persistido; snapshot completo nao pode.
    assert.deepEqual(selecionarCamposNr33(estado)[campo], valor);
    for (const fn of [validarEstruturaNr33, reconstruirAvaliacaoEspecifica, prepararDadosRegrasNr33, representarEstadoCanonicoNr33]) assert.throws(() => fn(estado), TypeError);
  }
  assert.throws(() => reconstruirAvaliacaoEspecifica({ [MARCADOR]: false }), TypeError);
});

test('mescla preserva omitidos, false e null sem completar respostas', () => {
  assert.deepEqual(mesclarCamposNr33(), {});
  assert.deepEqual(mesclarCamposNr33(completo, {}), completo);
  assert.deepEqual(mesclarCamposNr33(completo, { atmosfera_contaminantes: undefined }), completo);
  const esperado = { ...completo, atmosfera_contaminantes: false, possui_placa_identificacao: null };
  assert.deepEqual(mesclarCamposNr33({ ...completo, observacoes: 'fora da projecao' }, { atmosfera_contaminantes: false, possui_placa_identificacao: null }), esperado);
  assert.deepEqual(mesclarCamposNr33({}, { [MARCADOR]: true }), { [MARCADOR]: true });
  assert.deepEqual(mesclarCamposNr33(completo, { potencial_afogamento: null }), { ...completo, potencial_afogamento: null });
  assert.throws(() => mesclarCamposNr33(completo, { [MARCADOR]: null }), TypeError);
  const limpeza = Object.fromEntries([...especificos, MARCADOR].map(c => [c, null]));
  assert.deepEqual(mesclarCamposNr33(completo, limpeza), { ...completo, ...limpeza });
  assert.throws(() => mesclarCamposNr33({}, { potencial_afogamento: 'SIM' }), TypeError);
  assert.throws(() => mesclarCamposNr33(completo, { id_usuario: 9 }), TypeError);
});

test('preparacao nao aceita objetos derivados forjados e nao infere dados ou origem historica', () => {
  const historico = { ...criterios, status: 'CONCLUIDO', identificacao_espaco: 'A', avaliacao_nr33: { resultado: 'NAO_CARACTERIZADO' },
    avaliacao_especifica: condicoes, evidenciaHistoricaIncompleta: 'forjado' };
  const preparado = prepararDadosRegrasNr33(historico);
  assert.deepEqual(preparado, { ...criterios, status: 'CONCLUIDO', avaliacao_especifica: null });
  assert.equal(regras.consolidarCaracterizacao(preparado).origem, 'REGRA_GERAL');
  const divergente = prepararDadosRegrasNr33({ ...completo, criterio_a: 'NAO', criterio_b: 'NAO', criterio_c: 'NAO' });
  assert.equal(divergente.criterio_a, 'NAO'); assert.equal(divergente.criterio_b, 'NAO');
  assert.deepEqual(divergente.avaliacao_especifica, condicoes);
  assert.equal(regras.consolidarCaracterizacao(divergente).origem, 'HIPOTESE_ESPECIFICA');
  assert.deepEqual(prepararDadosRegrasNr33({ criterio_a: 'SIM', criterio_b: null }), { criterio_a: 'SIM', criterio_b: null, avaliacao_especifica: null });
});

test('preparacao e canonico rejeitam tipos invalidos nos criterios atuais/status', () => {
  for (const campo of CAMPOS_ESTADO_RELEVANTE.filter(c => !CAMPOS_NR33.includes(c))) {
    for (const valor of [false, 1, '', [], {}, campo === 'status' ? 'CARACTERIZADO' : 'sim']) {
      assert.throws(() => prepararDadosRegrasNr33({ [campo]: valor }), TypeError);
      assert.throws(() => representarEstadoCanonicoNr33({ [campo]: valor }), TypeError);
    }
  }
  assert.deepEqual(prepararDadosRegrasNr33({ status: null }), { status: null, avaliacao_especifica: null });
});

test('canonico e deterministico, ordenado e sensivel a cada dado relevante', () => {
  const estado = { ...criterios, status: 'PENDENTE', ...completo };
  const invertido = Object.fromEntries(Object.entries(estado).reverse());
  assert.equal(representarEstadoCanonicoNr33(estado), representarEstadoCanonicoNr33(invertido));
  assert.equal(representarEstadoCanonicoNr33(estado), representarEstadoCanonicoNr33({ ...estado, observacoes: 'irrelevante', id_usuario: 123 }));
  const parsed = JSON.parse(representarEstadoCanonicoNr33(estado));
  assert.equal(parsed.formato, 'nr33-estado-relevante-v1');
  assert.deepEqual(parsed.campos.map(([c]) => c), CAMPOS_ESTADO_RELEVANTE);
  for (const campo of CAMPOS_ESTADO_RELEVANTE) {
    const valor = estado[campo];
    const novo = campo === MARCADOR ? null : typeof valor === 'boolean' ? !valor : campo === 'status' ? 'CONCLUIDO' : valor === 'SIM' ? 'NAO' : 'SIM';
    const mudado = { ...estado, [campo]: novo };
    if (campo === MARCADOR) for (const c of especificos) mudado[c] = null;
    assert.notEqual(representarEstadoCanonicoNr33(estado), representarEstadoCanonicoNr33(mudado));
  }
  assert.equal(representarEstadoCanonicoNr33({}), representarEstadoCanonicoNr33({ atmosfera_oxigenio: undefined }));
  const representacoes = [{}, { atmosfera_oxigenio: null }, { atmosfera_oxigenio: false }, { atmosfera_oxigenio: true }].map(representarEstadoCanonicoNr33);
  assert.equal(new Set(representacoes).size, 4);
});

test('compatibilidade com classificacao, aplicabilidade, conclusao e transicoes aprovadas', () => {
  const geral = prepararDadosRegrasNr33({ ...criterios, atmosfera_oxigenio: true, possui_placa_identificacao: false });
  assert.equal(regras.consolidarCaracterizacao(geral).origem, 'REGRA_GERAL');
  assert.equal(regras.validarConclusao(geral).valido, true);
  assert.deepEqual(regras.validarConclusao(geral).avisos, ['AUSENCIA_SINALIZACAO']);
  const especifica = prepararDadosRegrasNr33({ ...criterios, criterio_c: 'NAO', ...completo,
    atmosfera_oxigenio: null, atmosfera_contaminantes: null, atmosfera_explosiva: null });
  assert.equal(regras.consolidarCaracterizacao(especifica).origem, 'HIPOTESE_ESPECIFICA');
  assert.equal(regras.determinarAplicabilidade(especifica).placa, true);
  assert.equal(regras.validarConclusao(especifica).valido, true);
  const ambas = prepararDadosRegrasNr33({ ...criterios, ...completo });
  assert.equal(regras.consolidarCaracterizacao(ambas).origem, 'AMBAS');
  const depois = prepararDadosRegrasNr33({ ...geral, criterio_c: 'NAO' });
  const transicao = regras.prepararTransicao(geral, depois);
  assert.equal(transicao.atmosfera.deixaDeSerAplicavel, true);
  assert.deepEqual(transicao.limpezas, []);
  assert.ok(transicao.preservadas.includes('possui_placa_identificacao'));
  assert.equal(depois.possui_placa_identificacao, false);
});

function congelar(objeto) { for (const valor of Object.values(objeto)) if (valor && typeof valor === 'object') congelar(valor); return Object.freeze(objeto); }
test('entradas e saidas nao compartilham objetos mutaveis', () => {
  const anterior = congelar({ ...criterios, ...completo, extra: { manter: true } });
  const patch = congelar({ possui_placa_identificacao: null });
  const copia = structuredClone(anterior), copiaPatch = structuredClone(patch);
  const selecao = selecionarCamposNr33(anterior); selecao.atmosfera_oxigenio = true;
  const validado = validarEstruturaNr33(anterior); validado[MARCADOR] = null;
  const mesclado = mesclarCamposNr33(anterior, patch); mesclado.potencial_afogamento = null;
  const avaliacao = reconstruirAvaliacaoEspecifica(anterior); avaliacao.potencial_afogamento = null;
  const preparado = prepararDadosRegrasNr33(anterior); preparado.avaliacao_especifica.potencial_afogamento = null;
  representarEstadoCanonicoNr33(anterior);
  assert.deepEqual(anterior, copia); assert.deepEqual(patch, copiaPatch);
});

test('API pura nao carrega banco, Express, configuracao ou servicos', () => {
  const filename = require.resolve('../src/utils/adaptadorCamposNr33');
  const dependencias = require.cache[filename].children.map(m => m.filename);
  assert.deepEqual(dependencias, [require.resolve('../src/utils/regrasCaracterizacaoNr33')]);
});
