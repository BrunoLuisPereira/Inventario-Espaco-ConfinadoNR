"""Laboratorio mecanico real; NAO emite prontidao e NAO chama Runtime.main."""
import hashlib
import io
import json
import os
from pathlib import Path
import pwd
import subprocess
import sys
import tarfile
import time

sys.path.insert(0, '/usr/local/lib/nr33-cd')
import servidor as s
from artefato import verificar, digest
from contrato import Bloqueado, canonical, prontidao

OLD, NEW = '1' * 40, '2' * 40
RESULTS = Path('/lab-results')
EVENTS = []


def guard():
    assert os.geteuid() == 0 and Path('/.dockerenv').exists()
    assert Path('/run/nr33-lab/marker').read_text() == 'DISPOSABLE-NR33-LAB\n'
    assert Path('/proc/1/comm').read_text().strip() == 'systemd'
    assert not Path('/etc/nr33/cd.json').exists(), 'Nunca usar configuracao CD'
    # --network none: nenhum dispositivo alem de loopback.
    assert {p.name for p in Path('/sys/class/net').iterdir()} == {'lo'}


def event(kind, **fields):
    EVENTS.append(dict(event=kind, utc=time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), **fields))
    (RESULTS / 'events.json').write_bytes(canonical(EVENTS))


def package(release):
    files = {
        'backend/package.json': b'{"name":"synthetic-lab","version":"1.0.0"}',
        'backend/package-lock.json': b'{"name":"synthetic-lab","version":"1.0.0","lockfileVersion":3,"packages":{}}',
        'backend/src/server.js': Path('/opt/nr33-lab/backend.cjs').read_bytes(),
        'shared/permissoes.json': b'{}', 'shared/espacoConfinado.mjs': b'export {};',
        'frontend/index.html': b'SYNTHETIC NR33 LAB',
        'frontend/release.json': canonical({'sha': release}),
    }
    manifest = dict(protocol=1, sha=release, approval='NOT_VERIFIED', deployEligible=False,
                    files={n: dict(size=len(b), sha256=digest(b)) for n, b in files.items()})
    path = RESULTS / (release + '.tar.gz')
    with tarfile.open(path, 'w:gz', format=tarfile.USTAR_FORMAT) as archive:
        for name, data in sorted({**files, 'manifest.json': canonical(manifest)}.items()):
            header = tarfile.TarInfo(name)
            header.size, header.mode = len(data), 0o644
            archive.addfile(header, io.BytesIO(data))
    h = digest(path.read_bytes())
    verificar(path, release, h)
    event('synthetic_package_verified', sha=release, sha256=h)
    return path, h


def install_release(path, release, h):
    manifest, files = verificar(path, release, h)
    target = s.BASE / release
    assert not target.exists()
    target.mkdir(mode=0o755)
    for name, data in files.items():
        dest = target / name
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(data)
        dest.chmod(0o644)
    (target / 'release-manifest.json').write_bytes(canonical(manifest))
    uploads = target / 'backend/uploads'
    uploads.mkdir(mode=0o555)
    for name in ('evidencias', 'relatorios'):
        dest = uploads / name
        dest.mkdir(mode=0o555)
        s.executar(['mount', '--bind', str(s.PERSIST / name), str(dest)])
        s.executar(['mount', '-o', 'remount,bind,rw,nosuid,nodev,noexec', str(dest)])


class LabRuntime(s.Runtime):
    """Adapta SOMENTE fronteiras nao comprovadas. Metodos operacionais herdados reais.

    Construtor/authorize/preflight/prepare/schema/sql nao sao os de producao.
    Nao ha receipt administrativo, AWS fake no PATH, banco ou enabled=true.
    """
    def __init__(self, release, previous, paths):
        guard()
        self.release, self.previous, self.paths = release, previous, paths
        self.artifact = paths[release][1]
        self.user = pwd.getpwnam('nr33lab')
        self.config = dict(public_host='nr33-rollback.invalid', database_role='nr33lab')
        self.old_dropin = None

    def authorize(self):
        guard()
        verificar(self.paths[self.release][0], self.release, self.artifact)
        event('lab_guard_only_NOT_PRODUCTION_AUTHORIZATION')

    def schema(self):
        event('schema_NOT_TESTED_no_database')

    def sql(self, query):
        # Somente a consulta de parada usa este adaptador. Zero conexoes e sintetico.
        assert query.startswith('SELECT count(*) FROM pg_stat_activity ')
        event('connection_count_SYNTHETIC_no_database')
        return '0'

    def preflight(self):
        self.authorize()
        for p in (s.BASE, '/var/www/nr33', s.DROPIN.parent, '/run/nr33', s.LOGS, s.PERSIST):
            s.seguro(p, True)
        s.seguro(s.ENV_FILE)
        s.seguro(s.DROPIN)
        assert s.FRONT.is_symlink() and s.FRONT.resolve() == s.BASE / self.previous / 'frontend'
        self.old_dropin = s.DROPIN.read_bytes()
        assert str(s.BASE / self.previous / 'backend').encode() in self.old_dropin
        unit = self.units()
        assert unit['ActiveState'] == 'active' and unit['User'] == 'nr33lab'
        assert unit['KillMode'] == 'control-group' and str(s.ENV_FILE) in unit['EnvironmentFiles']
        assert s.executar(['node', '--version']).startswith('v24.')
        self.mount_release(self.previous)
        self.release_integrity(self.previous)
        event('local_preflight_passed_AWS_and_schema_NOT_TESTED')

    def prepare(self):
        # Releases ja seladas pelo instalador do laboratorio; sem S3/npm reais.
        self.mount_release(self.release)
        self.release_integrity(self.release)
        event('local_candidate_prepared_NOT_Runtime_prepare')

    def record(self, status):
        super().record(status)
        event('transaction_result', status=status, sha=self.release, previous_sha=self.previous)


def check(runtime, expected, maintenance=False):
    assert s.FRONT.resolve() == s.BASE / expected / 'frontend'
    assert s.MAINTENANCE.exists() == maintenance
    if not maintenance:
        runtime.public_health(expected)
    for release in (OLD, NEW):
        runtime.mount_release(release)
        runtime.release_integrity(release)
    for name in ('evidencias', 'relatorios'):
        assert (s.PERSIST / name / 'sentinel.txt').read_bytes() == b'SYNTHETIC-PERSISTENCE\n'
    event('state_checked', expected=expected, maintenance=maintenance,
          unit=runtime.units(), mounts=json.loads(s.executar(['findmnt', '--json', '--output', 'TARGET,SOURCE,OPTIONS'])))


def transaction(runtime, expected_status, *, rehearsal=False):
    before = len(EVENTS)
    try:
        with s.Lock('/run/nr33-cd/deploy.lock'):
            s.transacao(runtime, ensaio_isolado=rehearsal)
    except Bloqueado as error:
        event('expected_transaction_exception', message=str(error))
        if expected_status == 'SUCCESS':
            raise
    statuses = [e['status'] for e in EVENTS[before:] if e['event'] == 'transaction_result']
    assert statuses == [expected_status], statuses


def main():
    guard()
    RESULTS.mkdir(exist_ok=True)
    # Nenhuma evidencia operacional e fabricada, inclusive antes do ensaio.
    readiness = json.loads(Path('/opt/nr33-source/infra/cd/readiness.example.json').read_text())
    assert readiness['rollback_tested'] is False and readiness['approved'] is False
    try:
        prontidao(readiness, NEW, '0' * 64)
    except Bloqueado:
        event('production_readiness_rejected_as_required')
    else:
        raise AssertionError('Exemplo nao pode autorizar')
    paths = {release: package(release) for release in (OLD, NEW)}
    for release, (path, h) in paths.items():
        install_release(path, release, h)
    for name in ('evidencias', 'relatorios'):
        s.executar(['runuser', '-u', 'nr33lab', '--', 'sh', '-c',
                    'printf "SYNTHETIC-PERSISTENCE\\n" > "$1"', 'sh', str(s.PERSIST / name / 'sentinel.txt')])
    initial = LabRuntime(NEW, OLD, paths)
    initial.activate(OLD)
    initial.start()
    initial.health(OLD)
    check(initial, OLD)
    transaction(initial, 'ROLLBACK_REHEARSED_ISOLATED', rehearsal=True)
    check(initial, OLD)
    event('explicit_rollback_rehearsal_COMPLETED_synthetic_only')
    transaction(initial, 'SUCCESS')
    check(initial, NEW)
    # Escrita pelo usuario da aplicacao atraves da candidata deve sobreviver a volta.
    for name in ('evidencias', 'relatorios'):
        dest = s.BASE / NEW / 'backend/uploads' / name / 'candidate-write.txt'
        s.executar(['runuser', '-u', 'nr33lab', '--', 'sh', '-c',
                    'printf "WRITTEN-BY-CANDIDATE\\n" > "$1"', 'sh', str(dest)])
    back = LabRuntime(OLD, NEW, paths)
    transaction(back, 'SUCCESS')
    check(back, OLD)
    for name in ('evidencias', 'relatorios'):
        dest = s.BASE / OLD / 'backend/uploads' / name / 'candidate-write.txt'
        assert s.executar(['runuser', '-u', 'nr33lab', '--', 'cat', str(dest)]) == 'WRITTEN-BY-CANDIDATE'
    event('baseline_candidate_baseline_COMPLETED')

    Path('/run/nr33-lab/fail-candidate').touch()
    failed = LabRuntime(NEW, OLD, paths)
    transaction(failed, 'ROLLED_BACK')
    check(failed, OLD)

    Path('/run/nr33-lab/fail-baseline').touch()
    broken = LabRuntime(NEW, OLD, paths)
    transaction(broken, 'MANUAL_RECOVERY_REQUIRED')
    check(broken, OLD, maintenance=True)
    assert broken.code('/api/health') == '503'
    assert broken.units()['ActiveState'] != 'active'

    # Recuperacao manual somente deste container, preservando releases e mounts.
    for name in ('fail-candidate', 'fail-baseline'):
        Path('/run/nr33-lab', name).unlink()
    s.executar(['systemctl', 'reset-failed', 'nr33-backend.service'])
    broken.restore()
    broken.start()
    broken.health(OLD)
    broken.maintenance(False)
    check(broken, OLD)
    event('manual_recovery_COMPLETED')
    summary = dict(status='COMPLETED_SYNTHETIC_LAB_ONLY', production_readiness=False,
                   production_rollback_tested=False, packages={k: v[1] for k, v in paths.items()},
                   source_hashes={p.name: hashlib.sha256(p.read_bytes()).hexdigest()
                                  for p in Path('/usr/local/lib/nr33-cd').glob('*.py')},
                   limitations=['synthetic application and SHAs', 'no AWS/SSM/OIDC',
                                'no database/schema compatibility/backup restore',
                                'authorization and prepare adapted; no production readiness',
                                'no application dependencies installed; presealed lab releases'])
    (RESULTS / 'summary.json').write_bytes(canonical(summary))


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        RESULTS.mkdir(exist_ok=True)
        (RESULTS / 'failure.json').write_bytes(canonical(dict(status='FAILED_OR_PENDING', error=repr(error))))
        raise
