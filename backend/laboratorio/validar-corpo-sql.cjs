// Inspeciona comandos externos a strings, comentarios e corpos dollar-quoted.
// Nao e um executor ou validador completo da gramatica PostgreSQL.
function validarCorpoSQL(sql) {
  let comando = '', profundidadeComentario = 0;
  const comandos = [];
  for (let i=0; i<sql.length;) {
    if (sql.startsWith('--',i)) { const fim=sql.indexOf('\n',i+2); i=fim<0?sql.length:fim+1; comando+=' '; continue; }
    if (sql.startsWith('/*',i)) {
      profundidadeComentario=1; i+=2;
      while (i<sql.length && profundidadeComentario) {
        if (sql.startsWith('/*',i)) { profundidadeComentario++; i+=2; }
        else if (sql.startsWith('*/',i)) { profundidadeComentario--; i+=2; }
        else i++;
      }
      if (profundidadeComentario) throw Error('Comentario SQL incompleto.');
      comando+=' '; continue;
    }
    if (sql[i]==='\\') throw Error('Metacomando psql proibido nas fontes.');
    if (sql[i]==="'" || sql[i]==='"') {
      const quote=sql[i++];
      // Fontes auditadas usam strings padrao; E-strings nao sao necessarias.
      if (quote==="'" && /(?:^|[^\w])E$/i.test(comando)) throw Error('Escape SQL nao suportado nas fontes.');
      let fechou=false;
      while (i<sql.length) {
        if (sql[i++]===quote) {
          if (sql[i]===quote) { i++; continue; }
          fechou=true; break;
        }
      }
      if (!fechou) throw Error('String SQL incompleta.');
      comando+=' literal '; continue;
    }
    const tag = sql[i]==='$' ? /^\$(?:[A-Za-z_][A-Za-z_0-9]*)?\$/.exec(sql.slice(i))?.[0] : null;
    if (tag) {
      const fim=sql.indexOf(tag,i+tag.length);
      if (fim<0) throw Error('Corpo SQL incompleto.');
      i=fim+tag.length; comando+=' corpo '; continue;
    }
    if (sql[i]===';') { comandos.push(comando.trim()); comando=''; i++; continue; }
    comando+=sql[i++];
  }
  if (comando.trim()) throw Error('Comando SQL sem delimitador.');
  for (const c of comandos.filter(Boolean)) {
    if (/^(?:BEGIN|START\s+TRANSACTION|COMMIT|END|ROLLBACK|ABORT|SAVEPOINT|RELEASE|PREPARE\s+TRANSACTION)\b/i.test(c) ||
        /^(?:CREATE|DROP|ALTER)\s+DATABASE\b/i.test(c) || /^SET\b[\s\S]*\bAUTOCOMMIT\b/i.test(c)) {
      throw Error('Controle transacional ou troca de banco proibido dentro das fontes.');
    }
  }
  return comandos.filter(Boolean);
}
module.exports = { validarCorpoSQL };
