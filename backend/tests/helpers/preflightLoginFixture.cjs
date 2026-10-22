// Catálogo PostgreSQL 17 sintético. Não cria tabelas ou conexões.
const perfis=['ADMINISTRADOR','ENGENHEIRO_SEGURANCA','TECNICO_SEGURANCA','COORDENADOR','SUPERVISOR','AUDITOR','VISUALIZADOR'];
function fixture() {
  const coluna=(nome,tipo,obrigatoria=true,padrao=null)=>({nome,tipo,obrigatoria,padrao,identidade:'',gerada:''});
  const constraint=(tipo,definicao,colunas=[],extras={})=>({tipo,definicao,colunas,validada:true,diferivel:false,diferida:false,...extras});
  const indice=(nome,colunas,extras={})=>({nome,colunas,primaria:false,unico:false,valido:true,pronto:true,imediato:true,
    metodo:'btree',chaves:colunas.length,atributos:colunas.length,expressao:null,predicado:null,opcoes:colunas.map(()=>0).join(' '),...extras});
  const tabela=oid=>({oid,relkind:'r',relpersistence:'p',relrowsecurity:false,relforcerowsecurity:false,relispartition:false,triggers:false});
  const login={tabela:tabela(100),colunas:[
    coluna('tipo','text'),coluna('chave_hash','text'),coluna('falhas','timestamp with time zone[]',true,"'{}'::timestamp with time zone[]"),
    coluna('inicio_janela','timestamp with time zone',true,'clock_timestamp()'),coluna('requisicoes','integer',true,'0'),
    coluna('restrito_ate','timestamp with time zone',false),coluna('atualizado_em','timestamp with time zone',true,'clock_timestamp()')],
  constraints:[constraint('p','PRIMARY KEY (tipo, chave_hash)',['tipo','chave_hash']),
    ...["CHECK ((tipo = ANY (ARRAY['identificador'::text, 'ip'::text])))",
      "CHECK ((chave_hash ~ '^[0-9a-f]{64}$'::text))",
      'CHECK (((requisicoes >= 0) AND (requisicoes <= 100)))',
      'CHECK ((cardinality(falhas) <= 5))',
      'CHECK ((array_position(falhas, NULL::timestamp with time zone) IS NULL))',
      "CHECK ((((tipo = 'ip'::text) AND (cardinality(falhas) = 0)) OR ((tipo = 'identificador'::text) AND (requisicoes = 0))))"]
      .map(d=>constraint('c',d))],
  indices:[indice('login_tentativa_pkey',['tipo','chave_hash'],{primaria:true,unico:true}),indice('idx_login_tentativa_limpeza',['atualizado_em'])]};
  const usuario={tabela:tabela(200),colunas:[coluna('id_usuario','bigint'),coluna('id_ambiente','uuid'),
    coluna('nome','character varying(120)'),coluna('email','character varying(180)'),coluna('senha_hash','character varying(255)'),
    coluna('perfil_acesso','character varying(30)'),coluna('eh_fundador','boolean'),coluna('ativo','boolean')],
  constraints:[constraint('p','PRIMARY KEY (id_usuario)',['id_usuario']),
    constraint('f','FOREIGN KEY (id_ambiente) REFERENCES public.ambiente(id_ambiente)',['id_ambiente'],{referencia:'public.ambiente',colunas_ref:['id_ambiente']}),
    constraint('c',`CHECK (((perfil_acesso)::text = ANY (ARRAY[${perfis.map(p=>`'${p}'::text`).join(', ')}])))`),
    constraint('c',"CHECK ((eh_fundador = ((perfil_acesso)::text = 'ADMINISTRADOR'::text)))")],
  indices:[indice('uq_usuario_email_normalizado',[null],{unico:true,expressao:'lower(btrim((email)::text))'}),
    indice('uq_usuario_fundador_ambiente',['id_ambiente'],{unico:true,predicado:'eh_fundador'})]};
  const ambiente={tabela:tabela(300),colunas:[coluna('id_ambiente','uuid'),coluna('ativo','boolean')],
    constraints:[constraint('p','PRIMARY KEY (id_ambiente)',['id_ambiente'])],indices:[]};
  return {identidade:{banco:'inventario_nr33_multitenant_dev',papel:'nr33_dev_app',sessao:'nr33_dev_app',
    versao:17,host:'127.0.0.1',porta:5432,privilegiado:false},
  tabelas:{'public.login_tentativa':login,'public.usuario':usuario,'public.ambiente':ambiente},
  permissoes:{conectar:true,schema:true,selecionar:true,inserir:true,atualizar:true,usuario:true,ambiente:true,tabelas:11,vinculo:true,versionamento:true}};
}
function clientSimulado(catalogo) {
  const queries=[], releases=[];
  let falha;
  return {queries,releases, falhar(trecho) { falha=trecho; },
    release(descartar) { releases.push(descartar); },
    async query(sql,params=[]) {
      queries.push({sql,params});
      if (falha && sql.includes(falha)) throw Error('CREDENCIAL_SQL_NAO_PUBLICAR');
      if (/^(?:BEGIN|SET LOCAL|COMMIT|ROLLBACK)/.test(sql)) return {rows:[]};
      if (sql.includes('preflight:identidade')) return {rows:[catalogo.identidade]};
      if (sql.includes('preflight:permissoes')) return {rows:[catalogo.permissoes]};
      if (sql.includes('preflight:tabela')) return {rows:catalogo.tabelas[params[0]] ? [catalogo.tabelas[params[0]].tabela] : []};
      for (const tipo of ['colunas','constraints','indices']) {
        if (sql.includes('preflight:'+tipo)) {
          const alvo=Object.values(catalogo.tabelas).find(t=>t.tabela.oid===params[0]);
          return {rows:alvo[tipo]};
        }
      }
      throw Error('Query não simulada');
    },
  };
}
module.exports={fixture,clientSimulado};
