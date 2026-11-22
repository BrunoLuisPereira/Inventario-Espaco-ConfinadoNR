"""Gera SOMENTE pacotes artificiais para testar o adaptador com PostgreSQL real."""
import hashlib
import io
import json
from pathlib import Path
import sys
import tarfile

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts/cd'))
from contrato import canonical
from artefato import digest


BACKEND = b'''const fs=require('node:fs');
const http=require('node:http');
const cp=require('node:child_process');
const server=http.createServer((req,res)=>{
 try {
  const value=cp.execFileSync('psql',['-X','-A','-t','-h',process.env.DB_HOST,'-U',process.env.DB_USER,'-d',process.env.DB_NAME,'-c','SELECT payload FROM lab_sentinel ORDER BY id'],{encoding:'utf8'}).trim();
  res.end(JSON.stringify({fixture:true,payload:value}));
 } catch(e) {res.statusCode=503;res.end('local database unavailable');}
});
server.listen(3000,'127.0.0.1');
process.on('SIGTERM',()=>server.close(()=>process.exit(0)));
'''


def create():
    target = Path(__file__).resolve().parent / 'staging'
    target.mkdir(parents=True, exist_ok=False)
    spec = {'protocol': 1, 'source_kind': 'fixtures', 'data_checks': [
        {'sql': 'SELECT payload FROM lab_sentinel ORDER BY id', 'sha256': digest(b'LOCAL-FIXTURE-ONLY')}]}
    for label, release in [('baseline', '1' * 40), ('candidate', '2' * 40)]:
        files = {'backend/package.json': b'{"name":"lab-fixture","version":"1.0.0"}',
                 'backend/package-lock.json': b'{"name":"lab-fixture","version":"1.0.0","lockfileVersion":3,"packages":{}}',
                 'backend/src/server.js': BACKEND,
                 'shared/permissoes.json': b'{}', 'shared/espacoConfinado.mjs': b'export {};',
                 'frontend/index.html': b'FIXTURE WITH REAL LOCAL POSTGRES',
                 'frontend/release.json': canonical({'sha': release})}
        manifest = {'protocol': 1, 'sha': release, 'approval': 'NOT_VERIFIED', 'deployEligible': False,
                    'files': {n: {'size': len(b), 'sha256': digest(b)} for n, b in files.items()}}
        path = target / (label + '.tar.gz')
        with tarfile.open(path, 'w:gz', format=tarfile.USTAR_FORMAT) as archive:
            for name, data in sorted({**files, 'manifest.json': canonical(manifest)}.items()):
                info = tarfile.TarInfo(name)
                info.size, info.mode = len(data), 0o644
                archive.addfile(info, io.BytesIO(data))
        spec[label] = {'sha': release, 'sha256': digest(path.read_bytes()), 'package': path.name}
    (target / 'input.json').write_bytes(canonical(spec))


if __name__ == '__main__':
    if len(sys.argv) != 1:
        raise SystemExit('Fixtures usam somente o staging fixo do laboratorio; argumentos proibidos')
    create()
