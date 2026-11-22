"""Adaptador offline. Nunca emite prontidao nem restaura bancos/backups."""
import hashlib
import datetime as dt
import json
import os
from pathlib import Path
import pwd
import re
import stat
import sys
import uuid

sys.path.insert(0, '/usr/local/lib/nr33-cd')
import servidor as s
from artefato import verificar
from contrato import exigir, sha, canonical

INPUT = Path('/lab-input')
RESULTS = Path('/lab-results')
DATABASE = 'inventario_nr33_homolog'


def digest(data):
    return hashlib.sha256(data).hexdigest()


def guard():
    s.proteger_ensaio_isolado()
    exigir(os.geteuid() == 0, 'laboratorio exige root local')
    exigir(Path('/proc/1/comm').read_text().strip() == 'systemd', 'PID 1 deve ser systemd')
    exigir(not any(k.startswith(('AWS_', 'SSM_')) for k in os.environ), 'credenciais/contexto AWS proibidos')
    exigir(not Path('/root/.aws').exists(), 'configuracao AWS proibida')
    # Nao aceitar volumes do host, sockets Docker ou dispositivos como entradas.
    mounts = json.loads(s.executar(['findmnt', '--json', '--list', '--output', 'TARGET']))['filesystems']
    targets = [m['target'] for m in mounts]
    for path in (INPUT, s.BASE, s.PERSIST, Path('/opt/nr33-lab/pgdata')):
        # Unicas submontagens admitidas: binds internos conferidos por inode.
        allowed = set()
        if path == s.BASE:
            for t in targets:
                match = re.fullmatch(re.escape(str(s.BASE)) + r'/[0-9a-f]{40}/backend/uploads/(evidencias|relatorios)', t)
                if match:
                    a, b = Path(t).stat(), (s.PERSIST / match[1]).stat()
                    exigir((a.st_dev, a.st_ino) == (b.st_dev, b.st_ino), 'bind externo ao laboratorio')
                    allowed.add(t)
        exigir(not any(t != '/' and (str(path) == t or str(path).startswith(t.rstrip('/') + '/')
                                    or t.startswith(str(path) + '/')) and t not in allowed
                       for t in targets), 'volume externo em caminho do laboratorio')
    exigir(not Path('/var/run/docker.sock').exists(), 'socket Docker proibido')


def load_spec(path):
    spec = json.loads(Path(path).read_text())
    exigir(spec.get('protocol') == 1, 'protocolo de laboratorio invalido')
    exigir(spec.get('source_kind') in ('fixtures', 'repository-releases'), 'origem obrigatoria')
    for name in ('baseline', 'candidate'):
        item = spec[name]
        sha(item['sha']); sha(item['sha256'], 64)
        exigir(item['package'] == name + '.tar.gz', 'nome de pacote fixo obrigatorio')
    exigir(spec['baseline']['sha'] != spec['candidate']['sha'], 'releases devem ser diferentes')
    checks = spec.get('data_checks')
    exigir(isinstance(checks, list) and 0 < len(checks) <= 30, 'invariantes de dados obrigatorias')
    for check in checks:
        exigir(isinstance(check.get('sql'), str) and re.match(r'^SELECT\s', check['sql'], re.I), 'consulta SELECT obrigatoria')
        sha(check['sha256'], 64)
    return spec


def inventory(root, *, dependency_links=False):
    root = Path(root)
    exigir(root.is_dir() and not root.is_symlink(), 'uploads ausentes ou symlink')
    result = {}
    for path in sorted(root.rglob('*')):
        mode = path.lstat().st_mode
        if path.is_symlink():
            exigir(dependency_links and path.resolve().is_relative_to(root.resolve()) and path.resolve().is_file(), 'symlink externo ou nos uploads')
            result[str(path.relative_to(root))] = {'link': os.readlink(path)}
        elif stat.S_ISDIR(mode):
            result[str(path.relative_to(root)) + '/'] = {'directory': True}
        else:
            exigir(stat.S_ISREG(mode) and path.stat().st_nlink == 1, 'upload especial ou hardlink')
            result[str(path.relative_to(root))] = {'sha256': digest(path.read_bytes()), 'size': path.stat().st_size}
    return result


class RealRuntime(s.Runtime):
    def __init__(self, spec, schema_hash):
        guard()
        self.spec = spec
        self.release, self.previous = spec['candidate']['sha'], spec['baseline']['sha']
        self.artifact = spec['candidate']['sha256']
        self.user = pwd.getpwnam('nr33lab')
        self.config = {'public_host': 'nr33-rollback.invalid', 'database': DATABASE, 'database_role': 'nr33lab'}
        self.receipt = {'schema_sha256': sha(schema_hash, 64)}  # Fingerprint local, sem aprovacao.
        self.old_dropin = None
        self.statuses = []

    def authorize(self):
        guard()
        for item in (self.spec['baseline'], self.spec['candidate']):
            verificar(s.seguro(INPUT / item['package']), item['sha'], item['sha256'])
        provenance = json.loads(s.seguro(INPUT / 'source-verification.json').read_text())
        exigir(provenance == {'source_kind': self.spec['source_kind'],
               'commits': [self.previous, self.release],
               'backend_shared_verified': self.spec['source_kind'] == 'repository-releases'}, 'origem de staging divergente')

    def sql(self, query):
        # Configuracao gerada pelo setup, exclusivamente socket Unix local.
        expected = ('[nr33_hml_readonly]\nhost=/var/run/postgresql\nport=5432\n'
                    'dbname=' + DATABASE + '\nuser=nr33inspect\n')
        exigir(s.seguro('/etc/nr33/pg_service.conf').read_text() == expected, 'PostgreSQL remoto ou configuracao divergente')
        return s.Runtime.sql(self, query)

    def preflight(self):
        self.authorize()
        for path in (s.BASE, s.DROPIN.parent, s.PERSIST, s.LOGS, '/run/nr33', '/run/nr33-cd', '/var/www/nr33'):
            s.seguro(path, True)
        exigir(s.seguro(s.ENV_FILE).read_text() == local_env(), 'ambiente da aplicacao nao e local')
        exigir(s.FRONT.is_symlink() and s.FRONT.resolve() == s.BASE / self.previous / 'frontend', 'baseline frontend divergente')
        self.old_dropin = s.seguro(s.DROPIN).read_bytes()
        exigir(str(s.BASE / self.previous / 'backend').encode() in self.old_dropin, 'drop-in baseline divergente')
        unit = self.units()
        exigir(unit.get('LoadState') == 'loaded' and unit.get('ActiveState') == 'active'
               and unit.get('User') == 'nr33lab' and unit.get('KillMode') == 'control-group'
               and str(s.ENV_FILE) in unit.get('EnvironmentFiles', ''), 'servico baseline nao preparado')
        exigir(s.executar(['node', '--version']).startswith('v24.'), 'Node 24 obrigatorio')
        roles = json.loads(self.sql("SELECT json_agg(row_to_json(x)) FROM (SELECT rolname,rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls FROM pg_roles WHERE rolname IN ('nr33lab','nr33inspect') ORDER BY rolname) x"))
        exigir(isinstance(roles, list) and len(roles) == 2 and
               all(not any(v for k, v in role.items() if k != 'rolname') for role in roles), 'roles locais privilegiadas')
        self.prepare()
        self.schema()
        self.public_health(self.previous)

    def prepare(self):
        for item in (self.spec['baseline'], self.spec['candidate']):
            self.release_integrity(item['sha'])
            self.mount_release(item['sha'])
            # Inventario selado de dependencias: detectar alteracoes alem do manifesto.
            actual = inventory(s.BASE / item['sha'] / 'backend/node_modules', dependency_links=True)
            expected = json.loads(s.seguro(INPUT / (item['sha'] + '-dependencies.json')).read_text())
            exigir(actual == expected, 'dependencias instaladas alteradas')

    def _health_once(self, release):
        super()._health_once(release)
        pid = self.units().get('MainPID', '0')
        exigir(pid.isdigit() and pid != '0', 'PID invalido')
        proc = Path('/proc') / pid
        exigir((proc / 'cwd').resolve() == s.BASE / release / 'backend', 'processo de outra release')
        args = (proc / 'cmdline').read_bytes().split(b'\0')
        exigir(str(s.BASE / release / 'backend/src/server.js').encode() in args, 'backend de outra release')
        self.check_data()

    def health(self, release):
        super().health(release)
        if release == self.release:
            # Escrita como usuario da aplicacao atraves dos mounts da candidata.
            for name in ('evidencias', 'relatorios'):
                path = s.BASE / release / 'backend/uploads' / name / self.sentinel
                s.executar(['/usr/sbin/runuser', '-u', 'nr33lab', '--', 'python3', '-c',
                            'import os,sys; f=os.open(sys.argv[1],os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600); os.write(f,b"LAB-CANDIDATE\\n"); os.close(f)', str(path)])

    def check_data(self):
        for check in self.spec['data_checks']:
            exigir(digest(self.sql(check['sql']).encode()) == check['sha256'], 'invariante de dados divergente')

    def record(self, status):
        super().record(status)
        self.statuses.append(status)


def local_env():
    # Sem transporte SMTP: o worker fica desabilitado explicitamente neste perfil.
    return ('PORT=3000\nDB_HOST=/var/run/postgresql\nDB_PORT=5432\nDB_USER=nr33lab\n'
            'DB_NAME=' + DATABASE + '\nEMAIL_TRANSPORT=disabled\n'
            'JWT_SECRET=LOCAL-DISPOSABLE-LAB-NOT-PRODUCTION\n')


def run(spec):
    guard()
    exigir(not (RESULTS / 'summary-real.json').exists(), 'nao reutilizar resultado anterior')
    # Esperado vem da preparacao independente, nao e aceito de uma release rodando.
    schema_hash = sha(s.seguro('/etc/nr33/lab-schema.sha256').read_text().strip(), 64)
    ops = RealRuntime(spec, schema_hash)
    ops.sentinel = 'cd-lab-' + uuid.uuid4().hex + '.txt'
    with s.Lock('/run/nr33-cd/deploy.lock'):
        ops.authorize()
        before = inventory(s.PERSIST)
        ops.public_health(ops.previous)
        s.transacao(ops, ensaio_isolado=True)
        exigir(ops.statuses == ['ROLLBACK_REHEARSED_ISOLATED'], 'rollback nao ensaiado')
        exigir(s.FRONT.resolve() == s.BASE / ops.previous / 'frontend' and not s.MAINTENANCE.exists(), 'baseline nao recuperada')
        ops.prepare()
        ops.public_health(ops.previous)
        after = inventory(s.PERSIST)
        expected = dict(before)
        for name in ('evidencias', 'relatorios'):
            key = name + '/' + ops.sentinel
            expected[key] = {'sha256': digest(b'LAB-CANDIDATE\n'), 'size': len(b'LAB-CANDIDATE\n')}
            path = s.BASE / ops.previous / 'backend/uploads' / name / ops.sentinel
            exigir(s.executar(['/usr/sbin/runuser', '-u', 'nr33lab', '--', 'cat', str(path)]) == 'LAB-CANDIDATE', 'upload nao recuperado')
        exigir(after == expected, 'uploads alterados alem das sentinelas')
        summary = {'status': 'VERIFIED_PACKAGES_LOCAL_POSTGRES_ROLLBACK',
                   'utc': dt.datetime.now(dt.timezone.utc).isoformat(),
                   'source_kind': spec['source_kind'], 'packages': {k: spec[k] for k in ('baseline', 'candidate')},
                   'schema_sha256': schema_hash, 'uploads_before_sha256': digest(canonical(before)),
                   'uploads_after_sha256': digest(canonical(after)), 'statuses': ops.statuses,
                   'data_checks_sha256': [c['sha256'] for c in spec['data_checks']], 'sentinel': ops.sentinel,
                   'production_readiness': False, 'production_rollback_tested': False,
                   'limitations': ['no AWS/OIDC/SSM', 'no production backup restored',
                                   'email worker disabled', 'local schema/data only',
                                   'frontend build provenance not independently reproduced'],
                   'source_hashes': {p.name: digest(p.read_bytes()) for p in Path('/usr/local/lib/nr33-cd').glob('*.py')}}
        s.atomico(RESULTS / 'summary-real.json', canonical(summary))
        return summary


if __name__ == '__main__':
    try:
        print(json.dumps(run(load_spec(INPUT / 'input.json'))))
    except Exception as error:
        # Nunca promover falha para resumo positivo; sem SQL/dados/segredos em erro.
        if RESULTS.is_dir():
            s.atomico(RESULTS / 'failure-real.json', canonical({'status': 'FAILED_OR_PENDING', 'type': type(error).__name__,
                      'reason': str(error) if isinstance(error, s.Bloqueado) else 'internal error'}))
        raise SystemExit(1)
