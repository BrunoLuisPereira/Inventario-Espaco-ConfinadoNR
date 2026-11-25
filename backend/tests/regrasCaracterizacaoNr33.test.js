const test = require('node:test');
const assert = require('node:assert/strict');
const r = require('../src/utils/regrasCaracterizacaoNr33');
const geral = { criterio_a: 'SIM', criterio_b: 'SIM', criterio_c: 'SIM' };
const especifica = { nao_destinado_ocupacao_humana: 'SIM', meios_limitados_entrada_saida: 'SIM',
  utilizado_armazenagem: 'SIM', potencial_engolfamento: 'SIM', potencial_afogamento: 'NAO' };
const demais = { acesso_controlado: 'SIM', ventilacao_adequada: 'NAO',
  monitoramento_atmosferico: 'SIM', procedimento_emergencia: 'NAO' };
const completo = { ...geral, ...demais, atmosfera_oxigenio: true,
  atmosfera_contaminantes: false, atmosfera_explosiva: false, possui_placa_identificacao: true };

for (const a of ['SIM', 'NAO', undefined]) for (const b of ['SIM', 'NAO', undefined]) for (const c of ['SIM', 'NAO', undefined]) {
  test(`regra geral A=${a}, B=${b}, C=${c}`, () => {
    const valores = [a, b, c];
    const dados = Object.fromEntries(r.CRITERIOS.flatMap((campo, i) => valores[i] === undefined ? [] : [[campo, valores[i]]]));
    const esperado = valores.includes(undefined) ? 'PENDENTE' : valores.every(v => v === 'SIM')
      ? 'CARACTERIZADO' : 'NAO_CARACTERIZADO_PELA_REGRA_GERAL';
    assert.equal(r.avaliarRegraGeral(dados), esperado);
    assert.equal(r.avaliarRegraGeral({ criterio_a: a ?? null, criterio_b: b ?? null, criterio_c: c ?? null }), esperado);
  });
}

test('hipótese específica distingue quatro estados e não presume respostas', () => {
  assert.equal(r.avaliarHipoteseEspecifica(), 'NAO_AVALIADA');
  assert.equal(r.avaliarHipoteseEspecifica(null), 'NAO_AVALIADA');
  assert.equal(r.avaliarHipoteseEspecifica({}), 'INFORMACOES_INSUFICIENTES');
  assert.equal(r.avaliarHipoteseEspecifica({ potencial_engolfamento: 'SIM' }), 'INFORMACOES_INSUFICIENTES');
  assert.equal(r.avaliarHipoteseEspecifica(especifica), 'ATENDIDA');
  assert.equal(r.avaliarHipoteseEspecifica({ ...especifica, potencial_engolfamento: 'NAO', potencial_afogamento: 'SIM' }), 'ATENDIDA');
  assert.equal(r.avaliarHipoteseEspecifica({ ...especifica, potencial_afogamento: 'SIM' }), 'ATENDIDA');
  for (const campo of r.CONDICOES_ESPECIFICAS.slice(0, 3)) {
    assert.equal(r.avaliarHipoteseEspecifica({ ...especifica, [campo]: 'NAO' }), 'NAO_ATENDIDA');
    assert.equal(r.avaliarHipoteseEspecifica({ ...especifica, [campo]: null }), 'INFORMACOES_INSUFICIENTES');
  }
  assert.equal(r.avaliarHipoteseEspecifica({ potencial_engolfamento: 'NAO', potencial_afogamento: 'NAO' }), 'NAO_ATENDIDA');
  assert.equal(r.avaliarHipoteseEspecifica({ ...especifica, potencial_engolfamento: null }), 'INFORMACOES_INSUFICIENTES');
});

// Matriz completa da expressão (N && L && A && (E || F)), com desconhecidos.
for (const n of ['SIM', 'NAO', null]) for (const l of ['SIM', 'NAO', null])
for (const a of ['SIM', 'NAO', null]) for (const e of ['SIM', 'NAO', null]) for (const f of ['SIM', 'NAO', null]) {
  test(`hipótese cumulativa/alternativa ${[n, l, a, e, f].join('/')}`, () => {
    const valores = [n, l, a, e, f];
    // Oráculo: expandir as respostas desconhecidas nas possibilidades SIM/NAO.
    let possibilidades = [[]];
    for (const valor of valores) possibilidades = possibilidades.flatMap(p => (valor === null ? ['SIM', 'NAO'] : [valor]).map(v => [...p, v]));
    const resultados = possibilidades.map(([nn, ll, aa, ee, ff]) => nn === 'SIM' && ll === 'SIM' && aa === 'SIM' && (ee === 'SIM' || ff === 'SIM'));
    const esperado = resultados.every(Boolean) ? 'ATENDIDA' : resultados.some(Boolean) ? 'INFORMACOES_INSUFICIENTES' : 'NAO_ATENDIDA';
    assert.equal(r.avaliarHipoteseEspecifica(Object.fromEntries(r.CONDICOES_ESPECIFICAS.map((campo, i) => [campo, valores[i]]))), esperado);
  });
}

test('consolidação: geral, específica, ambas, descartadas e pendentes', () => {
  assert.equal(r.consolidarCaracterizacao(geral).origem, 'REGRA_GERAL');
  assert.equal(r.consolidarCaracterizacao({ avaliacao_especifica: especifica }).origem, 'HIPOTESE_ESPECIFICA');
  assert.equal(r.consolidarCaracterizacao({ ...geral, avaliacao_especifica: especifica }).origem, 'AMBAS');
  assert.equal(r.consolidarCaracterizacao({ ...geral, criterio_c: 'NAO', avaliacao_especifica: especifica }).resultado, 'CARACTERIZADO');
  assert.equal(r.consolidarCaracterizacao({ ...geral, criterio_c: 'NAO', avaliacao_especifica: { utilizado_armazenagem: 'NAO' } }).resultado, 'NAO_CARACTERIZADO');
  for (const avaliacao_especifica of [undefined, null, {}, { potencial_afogamento: 'SIM' }]) {
    const consolidado = r.consolidarCaracterizacao({ ...geral, criterio_a: 'NAO', avaliacao_especifica });
    assert.equal(consolidado.resultado, 'PENDENTE'); assert.equal(consolidado.origem, 'AVALIACAO_PENDENTE');
  }
  assert.equal(r.consolidarCaracterizacao({ avaliacao_especifica: { utilizado_armazenagem: 'NAO' } }).resultado, 'PENDENTE');
});

test('aplicabilidade do formulario depende de C para atmosfera e de A/B/C para placa', () => {
  assert.equal(r.determinarAplicabilidade(geral).atmosfera, true);
  assert.equal(r.determinarAplicabilidade(geral).placa, true);
  const estado = r.determinarAplicabilidade({ criterio_c: 'NAO', avaliacao_especifica: especifica });
  assert.equal(estado.atmosfera, false); assert.equal(estado.placa, false);
  assert.equal(estado.classificacao.origem, 'HIPOTESE_ESPECIFICA');
  assert.equal(r.determinarAplicabilidade({}).placa, false);
  assert.equal(r.determinarAplicabilidade({ criterio_c: 'NAO' }).atmosfera, false);
});

test('seleção preserva omissão, undefined, null e false sem coerção', () => {
  assert.deepEqual(r.selecionarRespostasDependentes({}), {});
  for (const campo of r.DEPENDENTES) {
    assert.deepEqual(r.selecionarRespostasDependentes({ [campo]: undefined }), {});
    for (const valor of [true, false, null]) assert.deepEqual(r.selecionarRespostasDependentes({ [campo]: valor }), { [campo]: valor });
  }
});

test('conclusão aceita múltiplas condições e placa negativa sem mudar classificação', () => {
  const resultado = r.validarConclusao({ ...completo, atmosfera_contaminantes: true, atmosfera_explosiva: true, possui_placa_identificacao: false });
  assert.equal(resultado.valido, true);
  assert.deepEqual(resultado.avisos, ['AUSENCIA_SINALIZACAO']);
  assert.equal(resultado.classificacao.resultado, 'CARACTERIZADO');
  assert.deepEqual(r.validarConclusao(completo).avisos, []);
  assert.equal(Object.hasOwn(resultado, 'conformidadeSinalizacao'), false);
});

test('conclusão exige atmosfera, placa e respostas atuais; não exige hipótese adicional se geral comprovada', () => {
  assert.equal(r.validarConclusao(completo).valido, true);
  for (const valor of [undefined, null, false]) {
    const resultado = r.validarConclusao({ ...completo, atmosfera_oxigenio: valor });
    assert.ok(resultado.erros.some(e => e.codigo === 'CONDICAO_ATMOSFERICA_OBRIGATORIA'));
  }
  for (const valor of [undefined, null]) assert.ok(r.validarConclusao({ ...completo, possui_placa_identificacao: valor }).erros.some(e => e.codigo === 'RESPOSTA_PLACA_OBRIGATORIA'));
  for (const campo of [...r.CRITERIOS, ...Object.keys(demais)]) assert.ok(r.validarConclusao({ ...completo, [campo]: null }).erros.some(e => e.campos.includes(campo)));
  const incompleto = r.validarConclusao({ ...geral, criterio_c: 'NAO' });
  assert.equal(incompleto.valido, false);
  assert.ok(incompleto.erros.some(e => e.codigo === 'RESPOSTA_OBRIGATORIA'));
  assert.ok(!incompleto.erros.some(e => e.codigo === 'CARACTERIZACAO_PENDENTE'));
  assert.equal(incompleto.classificacao.resultado, 'PENDENTE');
});

test('conclusao com especifica atendida nao exige placa nem atmosfera quando C=NAO', () => {
  const dados = { ...geral, ...demais, criterio_c: 'NAO', avaliacao_especifica: especifica, possui_placa_identificacao: false };
  assert.equal(r.validarConclusao(dados).valido, true);
  const semPlaca = r.validarConclusao({ ...dados, possui_placa_identificacao: null });
  assert.equal(semPlaca.valido, true);
  assert.equal(semPlaca.classificacao.origem, 'HIPOTESE_ESPECIFICA');
  assert.ok(!semPlaca.avisos.includes('AUSENCIA_SINALIZACAO'));
  assert.equal(r.validarConclusao({ ...geral, ...demais, criterio_c: 'NAO', avaliacao_especifica: { utilizado_armazenagem: 'NAO' } }).valido, true);
});

test('respostas inaplicáveis, inclusive false, são preservadas sem influenciar classificação', () => {
  const dados = { ...geral, ...demais, criterio_c: 'NAO', avaliacao_especifica: { utilizado_armazenagem: 'NAO' } };
  for (const campo of r.DEPENDENTES) for (const valor of [true, false]) {
    const avaliacao = r.validarConclusao({ ...dados, [campo]: valor });
    assert.equal(avaliacao.valido, true);
    assert.equal(avaliacao.classificacao.resultado, 'NAO_CARACTERIZADO');
    assert.ok(avaliacao.avisos.includes('RESPOSTAS_INAPLICAVEIS_PRESERVADAS'));
  }
});

test('histórico não é inferido por combinação ou campo legado', () => {
  assert.equal(r.avaliarRegraGeral({ ...geral, identificacao_espaco: 'A' }), 'CARACTERIZADO');
  assert.equal(r.consolidarCaracterizacao({ criterio_a: 'SIM', criterio_b: 'NAO', criterio_c: 'NAO' }).resultado, 'PENDENTE');
  const contexto = { evidenciaHistoricaIncompleta: 'Importação documentada do modelo de resposta exclusiva, lote 18.' };
  const resultado = r.consolidarCaracterizacao(geral, contexto);
  assert.equal(resultado.resultado, 'PENDENTE');
  assert.deepEqual(resultado.alertas, ['AVALIACAO_HISTORICA_INCOMPLETA']);
  const preenchido = r.validarConclusao(completo, contexto);
  assert.equal(preenchido.valido, true);
  assert.equal(preenchido.classificacao.resultado, 'PENDENTE');
  assert.deepEqual(preenchido.classificacao.alertas, ['AVALIACAO_HISTORICA_INCOMPLETA']);
  assert.equal(r.consolidarCaracterizacao({ ...geral, avaliacao_especifica: especifica }, contexto).origem, 'HIPOTESE_ESPECIFICA');
  assert.equal(r.validarConclusao(geral).valido, false); // Sem novos campos, não há falha de execução.
});

test('transicoes identificam entrada/saida da placa do formulario mesmo com especifica atendida', () => {
  const entra = r.prepararTransicao({}, completo);
  assert.equal(entra.atmosfera.passaASerAplicavel, true); assert.equal(entra.placa.passaASerAplicavel, true);
  assert.deepEqual(entra.limpezas, []);
  const sai = r.prepararTransicao(completo, { ...completo, criterio_c: 'NAO' });
  assert.equal(sai.atmosfera.deixaDeSerAplicavel, true); assert.equal(sai.placa.deixaDeSerAplicavel, true);
  assert.deepEqual(sai.limpezas, []);
  assert.deepEqual(sai.preservadas, r.DEPENDENTES);
  const especificaHistorica = r.prepararTransicao(completo, { ...completo, criterio_c: 'NAO', avaliacao_especifica: especifica });
  assert.equal(especificaHistorica.placa.deixaDeSerAplicavel, true);
  assert.ok(especificaHistorica.preservadas.includes('possui_placa_identificacao'));
  assert.deepEqual(especificaHistorica.limpezas, []);
  assert.equal(r.prepararTransicao(completo, { ...completo, criterio_a: 'NAO' }).atmosfera.deixaDeSerAplicavel, false);
});

test('limpeza explícita não equivale a confirmação e omissão não apaga', () => {
  const sai = r.prepararTransicao(completo, { criterio_c: 'NAO', possui_placa_identificacao: null });
  assert.equal(sai.limpezas.find(l => l.campo === 'possui_placa_identificacao').limpezaExplicita, true);
  assert.equal(sai.limpezas.some(l => l.campo === 'atmosfera_oxigenio'), false);
  assert.equal(r.prepararTransicao({}, {}).limpezas.length, 0);
  const inconsistente = r.prepararTransicao({}, { atmosfera_oxigenio: false });
  assert.deepEqual(inconsistente.limpezas, []);
  assert.deepEqual(inconsistente.preservadas, ['atmosfera_oxigenio']);
});

for (const valor of ['SIM', 'NAO', 'false', 0, 1, [], {}, NaN]) test(`booleano inválido ${String(valor)}`, () => {
  for (const campo of r.DEPENDENTES) {
    assert.throws(() => r.selecionarRespostasDependentes({ [campo]: valor }), TypeError);
    assert.throws(() => r.validarConclusao({ ...completo, [campo]: valor }), TypeError);
  }
});

test('entradas e respostas inválidas são rejeitadas mesmo em caminhos de decisão antecipada', () => {
  for (const valor of [null, [], 'texto', 42, true, new Date()]) {
    for (const fn of [r.avaliarRegraGeral, r.consolidarCaracterizacao, r.determinarAplicabilidade, r.selecionarRespostasDependentes, r.validarConclusao]) assert.throws(() => fn(valor), TypeError);
    if (valor !== null) assert.throws(() => r.avaliarHipoteseEspecifica(valor), TypeError);
    assert.throws(() => r.prepararTransicao({}, valor), TypeError);
  }
  for (const valor of [false, true, '', 'sim', 0, [], {}]) {
    for (const campo of r.CRITERIOS) assert.throws(() => r.avaliarRegraGeral({ ...geral, [campo]: valor }), TypeError);
    for (const campo of r.CONDICOES_ESPECIFICAS) assert.throws(() => r.avaliarHipoteseEspecifica({ ...especifica, [campo]: valor }), TypeError);
  }
  assert.throws(() => r.consolidarCaracterizacao({ ...geral, avaliacao_especifica: [] }), TypeError);
  for (const valor of [null, '', ' ', false, 3]) assert.throws(() => r.avaliarRegraGeral(geral, { evidenciaHistoricaIncompleta: valor }), TypeError);
});

function congelar(valor) {
  if (valor && typeof valor === 'object') { Object.values(valor).forEach(congelar); Object.freeze(valor); }
  return valor;
}
test('todas as funções são determinísticas e não alteram parâmetros ou constantes', () => {
  const dados = congelar({ ...completo, avaliacao_especifica: { ...especifica } });
  const contexto = congelar({ evidenciaHistoricaIncompleta: 'Revisão documentada.' });
  const copia = structuredClone(dados);
  for (const fn of [r.avaliarRegraGeral, r.consolidarCaracterizacao, r.determinarAplicabilidade, r.validarConclusao]) {
    assert.deepEqual(fn(dados, contexto), fn(dados, contexto));
  }
  r.avaliarHipoteseEspecifica(dados.avaliacao_especifica);
  const selecionados = r.selecionarRespostasDependentes(dados); selecionados.atmosfera_oxigenio = false;
  r.prepararTransicao(dados, congelar({ ...dados, criterio_c: 'NAO' }), contexto, contexto);
  assert.deepEqual(dados, copia);
  for (const valor of [r.RESULTADO, r.HIPOTESE, r.ORIGEM, r.CRITERIOS, r.ATMOSFERA, r.DEPENDENTES, r.CONDICOES_ESPECIFICAS]) assert.ok(Object.isFrozen(valor));
});

// PASSO 03: contrato aprovado. Os testes anteriores ficam intactos como evidencia
// do contrato antigo; nao confundir conclusao do preenchimento com consolidacao.
for (const a of ['SIM', 'NAO']) for (const b of ['SIM', 'NAO']) for (const c of ['SIM', 'NAO']) {
  const dados = { ...demais, criterio_a: a, criterio_b: b, criterio_c: c,
    atmosfera_oxigenio: c === 'SIM' ? true : null,
    possui_placa_identificacao: a === 'SIM' && b === 'SIM' && c === 'SIM' ? false : null };
  test(`RED contrato: conclusao do preenchimento ${a}/${b}/${c} com hipotese nao avaliada`, () => {
    const avaliacao = r.validarConclusao(dados);
    assert.equal(avaliacao.valido, true, JSON.stringify(avaliacao.erros));
    assert.equal(avaliacao.classificacao.hipoteseEspecifica, 'NAO_AVALIADA');
    const geralAtendida = [a, b, c].every(v => v === 'SIM');
    assert.equal(avaliacao.classificacao.regraGeral, geralAtendida ? 'CARACTERIZADO' : 'NAO_CARACTERIZADO_PELA_REGRA_GERAL');
    assert.equal(avaliacao.classificacao.resultado, geralAtendida ? 'CARACTERIZADO' : 'PENDENTE');
  });
  test(`RED contrato: aplicabilidade ${a}/${b}/${c} independente de hipotese historica atendida`, () => {
    const aplicabilidade = r.determinarAplicabilidade({ ...dados, avaliacao_especifica: especifica });
    assert.equal(aplicabilidade.atmosfera, c === 'SIM');
    assert.equal(aplicabilidade.placa, [a, b, c].every(v => v === 'SIM'));
    assert.equal(aplicabilidade.classificacao.hipoteseEspecifica, 'ATENDIDA');
  });
  test(`RED contrato: classificacao conserva incerteza e aplicabilidade sem hipotese ${a}/${b}/${c}`, () => {
    const antes = structuredClone(dados), aplicabilidade = r.determinarAplicabilidade(dados);
    const atendida = [a, b, c].every(v => v === 'SIM');
    assert.equal(aplicabilidade.atmosfera, c === 'SIM');
    assert.equal(aplicabilidade.placa, atendida);
    assert.equal(aplicabilidade.classificacao.hipoteseEspecifica, 'NAO_AVALIADA');
    assert.equal(aplicabilidade.classificacao.resultado, atendida ? 'CARACTERIZADO' : 'PENDENTE');
    assert.equal(aplicabilidade.classificacao.origem, atendida ? 'REGRA_GERAL' : 'AVALIACAO_PENDENTE');
    assert.deepEqual(dados, antes);
  });
}

for (const campo of [...r.CRITERIOS, ...Object.keys(demais)]) test(`RED contrato: ausencia real de ${campo} impede conclusao`, () => {
  const avaliacao = r.validarConclusao({ ...completo, [campo]: null });
  assert.equal(avaliacao.valido, false);
  assert.ok(avaliacao.erros.some(e => e.codigo === 'RESPOSTA_OBRIGATORIA' && e.campos.includes(campo)));
});

test('RED contrato: hipotese iniciada incompleta nao bloqueia preenchimento nem descarta incerteza', () => {
  const avaliacao = r.validarConclusao({ ...demais, criterio_a: 'NAO', criterio_b: 'SIM', criterio_c: 'NAO', avaliacao_especifica: {} });
  assert.equal(avaliacao.classificacao.hipoteseEspecifica, 'INFORMACOES_INSUFICIENTES');
  assert.equal(avaliacao.classificacao.resultado, 'PENDENTE');
  assert.equal(avaliacao.valido, true, JSON.stringify(avaliacao.erros));
});

test('RED contrato: placa negativa aplicavel permite conclusao e mantem aviso', () => {
  const avaliacao = r.validarConclusao({ ...completo, possui_placa_identificacao: false });
  assert.equal(avaliacao.valido, true);
  assert.ok(avaliacao.avisos.includes('AUSENCIA_SINALIZACAO'));
});

test('RED contrato: historico inaplicavel e preservado sem exigir ou avisar ausencia de placa', () => {
  const dados = { ...completo, criterio_c: 'NAO', possui_placa_identificacao: false };
  const antes = structuredClone(dados), avaliacao = r.validarConclusao(dados);
  assert.deepEqual(dados, antes);
  assert.ok(avaliacao.avisos.includes('RESPOSTAS_INAPLICAVEIS_PRESERVADAS'));
  assert.ok(!avaliacao.avisos.includes('AUSENCIA_SINALIZACAO'));
  assert.equal(avaliacao.valido, true, JSON.stringify(avaliacao.erros));
});
