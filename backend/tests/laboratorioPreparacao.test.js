// Testes puros/estaticos: nao executam Docker, SQL, pg ou o servidor de laboratorio.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { destino, validarAmbiente, validarContainer } = require('../laboratorio/config.cjs');
const { montarSQL, arquivos } = require('../laboratorio/montar-sql.cjs');
const { derivar } = require('../laboratorio/gerar-baseline.cjs');
const banco = 'nr33_lab_20261018_702a9f';
const d = destino(banco);
const env = { DB_NAME: banco, DB_HOST: '127.0.0.1', DB_PORT: '55432', DB_USER: 'nr33_lab_app', DB_PASSWORD: 'x'.repeat(32), JWT_SECRET: 's'.repeat(48), NR33_LAB_AUTORIZADO: 'PASSO702' };
for (const invalido of ['inventario_espacos_confinados', 'inventario_espacos_confinados_homolog', 'postgres', '', null, {}, banco + '\n', banco.toUpperCase(), "nr33_lab_20261018_702a9f'; DROP DATABASE x;"]) {
  test('recusa destino invalido: ' + String(invalido), () => assert.throws(() => destino(invalido)));
}
test('destino gera identificadores exatos sem consultar recursos externos', () => {
  assert.equal(d.host, '127.0.0.1'); assert.equal(d.porta, 55432); assert.equal(d.portaHTTP, 3001);
  assert.equal(d.container, 'nr33-lab-20261018-702a9f'); assert.equal(d.id, '20261018_702a9f');
  assert.equal(validarAmbiente(env).banco, banco);
});
for (const [campo, valor] of [['DB_HOST','localhost'],['DB_HOST','192.168.1.1'],['DB_PORT','5432'],['DB_USER','postgres'],['DB_PASSWORD','curta'],['JWT_SECRET','curto'],['NR33_LAB_AUTORIZADO',undefined]]) {
  test('configuracao fail-closed: ' + campo + '/' + valor, () => assert.throws(() => validarAmbiente({ ...env, [campo]: valor })));
}
const info = () => ({ labels: { 'nr33.lab.id': d.id }, image: 'postgres:17.10', running: true, ports: { '5432/tcp': [{ HostIp: '127.0.0.1', HostPort: '55432' }] } });
test('prova de container exige label, imagem, atividade e binding exatos', () => {
  assert.strictEqual(validarContainer(d, info()), d);
  for (const alterar of [i => { i.labels={}; },i => { i.image='postgres:latest'; },i => { i.running=false; },i => { i.ports['5432/tcp'][0].HostIp='0.0.0.0'; },i => { i.ports['5432/tcp'][0].HostPort='5432'; },i => { i.ports['5432/tcp'].push({HostIp:'::',HostPort:'55432'}); }]) {
    const i=info(); alterar(i); assert.throws(() => validarContainer(d,i));
  }
});
const fontes = arquivos.map(a => fs.readFileSync(path.resolve(__dirname,'../database',a),'utf8'));
test('baseline revisado preserva inventario estrutural e default permitido', () => {
  const s = fontes[0];
  assert.equal((s.match(/^CREATE TABLE /gm)||[]).length,9);
  assert.equal((s.match(/ADD GENERATED ALWAYS AS IDENTITY/g)||[]).length,9);
  assert.equal((s.match(/^CREATE TRIGGER /gm)||[]).length,5);
  assert.equal((s.match(/ADD CONSTRAINT \w+ FOREIGN KEY/g)||[]).length,12);
  assert.match(s, /DEFAULT 'EM ANDAMENTO'::character varying/);
  assert.doesNotMatch(s, /DEFAULT 'ATIVA'|^COPY |^ALTER .* OWNER TO|^CREATE DATABASE/gm);
});
test('gerador recusa snapshot divergente sem produzir baseline ficticio', () => assert.throws(() => derivar('CREATE TABLE inventada();'), /Hash/));
test('montagem mantem uma transacao externa e ordem baseline, 020, 021', () => {
  const s = montarSQL(banco,fontes);
  assert.equal((s.match(/^BEGIN;/gm)||[]).length,1); assert.equal((s.match(/^COMMIT;/gm)||[]).length,1);
  assert.ok(s.indexOf('CREATE TABLE public.usuario') < s.indexOf('CREATE TABLE ambiente'));
  assert.ok(s.indexOf('$transicao$') < s.indexOf('REGULARIZACAO GERAL'));
  assert.match(s,new RegExp("current_database\\(\\) <> '"+banco+"'"));
});
test('montagem recusa nome externo, fontes incompletas e operacoes de outro banco', () => {
  assert.throws(() => montarSQL('inventario_espacos_confinados',fontes));
  assert.throws(() => montarSQL(banco,[]));
  assert.throws(() => montarSQL(banco,[fontes[0].replace('BEGIN;','CREATE DATABASE proibido;\nBEGIN;'),...fontes.slice(1)]));
  assert.throws(() => montarSQL(banco,[fontes[0].replace('BEGIN;','BEGIN;\n\\connect externo'),...fontes.slice(1)]));
});
test('020 bloqueia dados historicos antes de alterar estrutura e nao atribui tenant', () => {
  const s=fontes[1];
  assert.ok(s.indexOf('ACCESS EXCLUSIVE MODE') < s.indexOf('IF EXISTS (SELECT 1 FROM public.usuario)'));
  assert.ok(s.indexOf('IF EXISTS (SELECT 1 FROM public.usuario)') < s.indexOf('CREATE TABLE ambiente'));
  assert.doesNotMatch(s,/^UPDATE (?:usuario|campanha|sincronizacao|versao_entidade)\b/gm);
  assert.doesNotMatch(s,/^INSERT INTO ambiente\b/gm);
  assert.match(s,/Versionamento em transicao/);
});
test('021 regulariza as cinco entidades sem ID fixo e nao sobrescreve historico', () => {
  const s=fontes[2], regular=s.slice(s.indexOf('-- 3. REGULARIZACAO'),s.indexOf('-- 4. FUNCAO'));
  for (const tipo of ['CAMPANHA','LOCAL','CHECKLIST_NR33','DADOS_TECNICOS','EVIDENCIA']) assert.ok(regular.includes("'"+tipo+"'"));
  assert.match(regular,/IS DISTINCT FROM a.id_ambiente OR v.excluido/);
  assert.match(regular,/WHERE NOT EXISTS/);
  assert.doesNotMatch(regular,/\bUPDATE\s+public\.versao_entidade|ON CONFLICT/);
  assert.doesNotMatch(s,/\b(?:id_entidade|id_evidencia)\s*=\s*2\b/);
});
test('todas as fontes mantem avisos e guardas de laboratorio', () => {
  for (const s of fontes) { assert.match(s,/EM CONSTRUCAO/); assert.match(s,/current_database\(\)/); assert.match(s,/current_setting\('nr33.laboratorio', true\)/); }
});
test('app de laboratorio rejeita banco real antes de carregar routers', () => {
  const { criarApp } = require('../laboratorio/app.cjs');
  assert.throws(() => criarApp('inventario_espacos_confinados_homolog'), /Nome/);
  const s=fs.readFileSync(path.resolve(__dirname,'../laboratorio/app.cjs'),'utf8');
  assert.doesNotMatch(s,/require\(['"]\.\.\/src\/app|require\(['"]dotenv/);
});

test('destino de desenvolvimento tem banco, papel e volume exclusivos', () => {
  const dev = destino('inventario_nr33_multitenant_dev');
  assert.equal(dev.papel, 'nr33_dev_app');
  assert.equal(dev.persistente, true);
  assert.equal(dev.volume, 'nr33-multitenant-dev-710-dados');
  assert.equal(dev.autorizacao, 'PASSO710');
  assert.equal(dev.host, '127.0.0.1');
  assert.equal(dev.porta, 55432);
  assert.throws(() => validarAmbiente({ ...env, DB_NAME: dev.banco }));
  assert.equal(validarAmbiente({ ...env, DB_NAME: dev.banco, DB_USER: dev.papel, NR33_LAB_AUTORIZADO: dev.autorizacao }).banco, dev.banco);
});

test('desenvolvimento exige o volume exclusivo e recusa bind ou tmpfs', () => {
  const dev = destino('inventario_nr33_multitenant_dev');
  const i = { ...info(), labels: { 'nr33.lab.id': dev.id },
    mounts: [{ Type: 'volume', Name: dev.volume, Destination: '/var/lib/postgresql/data' }] };
  assert.strictEqual(validarContainer(dev, i), dev);
  for (const mounts of [[], undefined, [{ Type: 'bind', Name: dev.volume, Destination: '/var/lib/postgresql/data' }],
    [{ Type: 'volume', Name: 'volume-existente', Destination: '/var/lib/postgresql/data' }]]) {
    assert.throws(() => validarContainer(dev, { ...i, mounts }));
  }
});

test('composicao para desenvolvimento adapta somente a guarda conhecida em memoria', () => {
  const originais = [...fontes];
  const sql = montarSQL('inventario_nr33_multitenant_dev', fontes);
  assert.deepEqual(fontes, originais);
  assert.equal((sql.match(/current_database\(\) <> 'inventario_nr33_multitenant_dev'/g) || []).length, 4);
  assert.equal((sql.match(/IS DISTINCT FROM 'passo710'/g) || []).length, 3);
  assert.doesNotMatch(sql, /IS DISTINCT FROM 'passo702'/);
  assert.equal((sql.match(/^BEGIN;/gm) || []).length, 1);
  assert.equal((sql.match(/^COMMIT;/gm) || []).length, 1);
  assert.throws(() => montarSQL('inventario_nr33_multitenant_dev', [fontes[0].replace('DO $seguranca$', 'DO $diferente$'), ...fontes.slice(1)]), /Guarda/);
});

test('novo destino nao permite nomes protegidos, variantes ou injecao', () => {
  for (const nome of ['inventario_espacos_confinados', 'inventario_espacos_confinados_homolog',
    'inventario_nr33_multitenant_dev\n', 'inventario_nr33_multitenant_dev ', 'INVENTARIO_NR33_MULTITENANT_DEV',
    "inventario_nr33_multitenant_dev'; SELECT 1;"]) {
    assert.throws(() => destino(nome));
    assert.throws(() => montarSQL(nome, fontes));
  }
});
