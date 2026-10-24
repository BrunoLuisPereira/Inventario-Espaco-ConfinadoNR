// Processo inofensivo: sem pg, HTTP, arquivos ou geracao de credenciais.
let texto='';
process.stdin.setEncoding('utf8');
process.stdin.on('data',p=>{texto+=p;if(texto.length>16384)process.exit(1);});
process.stdin.on('end',()=>{
  const cfg=JSON.parse(texto);texto=null;
  if(cfg.modo==='timeout'){setInterval(()=>{},1000);return;}
  if(cfg.modo==='cancelar'){process.exitCode=2;return;}
  if(cfg.modo==='stderr'){process.stderr.write('[PREFLIGHT_FALHOU] SEGREDO_FIXTURE_NAO_PUBLICAR');process.exitCode=7;return;}
  if(cfg.modo==='invalido'){process.stdout.write('SEGREDO_FIXTURE_NAO_PUBLICAR');process.exitCode=9;return;}
  if(cfg.modo==='preflight'||cfg.modo==='http'){
    process.stdout.write(JSON.stringify({codigo:cfg.modo==='preflight'?'PREFLIGHT_FALHOU':'INICIALIZACAO_HTTP_FALHOU',segredo:'SEGREDO_FIXTURE_NAO_PUBLICAR'}));
    process.exitCode=1;return;
  }
  if(cfg.senha!=='fixture-ç-漢-💡'||process.env.JWT_SECRET||process.env.LOGIN_HMAC_SECRET||process.env.NODE_OPTIONS){process.exitCode=1;return;}
  process.stderr.write('SEGREDO_FIXTURE_NAO_PUBLICAR');
  process.stdout.write(JSON.stringify({codigo:'CANAL_VALIDADO',naoRepassar:'SEGREDO_FIXTURE_NAO_PUBLICAR'}));
});
