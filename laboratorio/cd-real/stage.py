"""Staging de pacotes sem lifecycle scripts; executar somente no build descartavel."""
import json
import os
import pwd
import re
from pathlib import Path
import subprocess
import sys

sys.path.insert(0, '/usr/local/lib/nr33-cd')
from adaptador import INPUT, load_spec, inventory
from artefato import verificar
from contrato import canonical, exigir


def source_check(spec, files, release, git_dir='/opt/nr33-stage/source.git'):
    if not isinstance(release, str) or re.fullmatch(r'[0-9a-f]{40}', release) is None:
        raise ValueError('SHA invalido antes de executar Git')
    if spec['source_kind'] == 'fixtures':
        return
    git = ['git', '--git-dir=' + str(git_dir)]
    subprocess.run(git + ['cat-file', '-e', release + '^{commit}'], check=True, capture_output=True)
    paths = subprocess.check_output(git + ['ls-tree', '-r', '--name-only', release, 'backend/src', 'shared'], text=True).splitlines()
    for name in paths:
        if re.fullmatch(r'(?:backend|shared)/(?:[A-Za-z0-9_-]+/)*[A-Za-z0-9_-]+\.[A-Za-z0-9]+', name) is None:
            raise ValueError('caminho inseguro na arvore Git')
    expected = {p for p in paths if Path(p).suffix in ('.js', '.cjs', '.mjs', '.json')}
    expected.update(('backend/package.json', 'backend/package-lock.json'))
    actual = {p for p in files if p.startswith(('backend/', 'shared/'))}
    exigir(actual == expected, 'inventario de codigo difere do commit')
    for name in expected:
        if re.fullmatch(r'(?:backend|shared)/(?:[A-Za-z0-9_-]+/)*[A-Za-z0-9_-]+\.(?:js|cjs|mjs|json)', name) is None:
            raise ValueError('caminho Git fora da allowlist')
        blob = subprocess.check_output(git + ['show', release + ':' + name])
        exigir(files[name] == blob, 'conteudo do pacote difere do commit')


def main():
    spec = load_spec(INPUT / 'input.json')
    if spec['source_kind'] == 'repository-releases':
        subprocess.run(['git', 'clone', '--bare', str(INPUT / 'source.bundle'), '/opt/nr33-stage/source.git'], check=True)
    for key in ('baseline', 'candidate'):
        item = spec[key]
        release = item['sha']
        if not isinstance(release, str) or re.fullmatch(r'[0-9a-f]{40}', release) is None:
            raise ValueError('SHA invalido antes de acessar releases')
        manifest, files = verificar(INPUT / (key + '.tar.gz'), release, item['sha256'])
        source_check(spec, files, release)
        target = Path('/opt/nr33/releases') / release
        target.mkdir(parents=True, exist_ok=False)
        for name, data in files.items():
            if re.fullmatch(r'(?:backend|shared|frontend)/(?:[A-Za-z0-9_-]+/)*[A-Za-z0-9_.-]+', name) is None:
                raise ValueError('arquivo fora da allowlist de staging')
            path = target / name
            if not path.resolve().is_relative_to(target.resolve()):
                raise ValueError('arquivo fora da release')
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
            path.chmod(0o644)
        (target / 'release-manifest.json').write_bytes(canonical(manifest))
        backend = target / 'backend'
        # npm recebe somente a configuracao local explicitamente fornecida.
        nobody = pwd.getpwnam('nobody')
        for root, dirs, names in os.walk(backend, followlinks=False):
            os.chown(root, nobody.pw_uid, nobody.pw_gid)
            for name in dirs + names:
                os.chown(Path(root) / name, nobody.pw_uid, nobody.pw_gid, follow_symlinks=False)
        subprocess.run(['/usr/sbin/runuser', '-u', 'nobody', '--', 'env', '-i',
                        'PATH=/usr/local/bin:/usr/bin:/bin', 'HOME=/opt/nr33-stage/npm',
                        'npm', 'ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--fund=false'], cwd=backend, check=True)
        exigir((backend / 'package-lock.json').read_bytes() == files['backend/package-lock.json'], 'lockfile alterado')
        # Fixtures sem dependencias tambem possuem inventario vazio verificavel.
        (backend / 'node_modules').mkdir(exist_ok=True)
        deps = inventory(backend / 'node_modules', dependency_links=True)
        (INPUT / (release + '-dependencies.json')).write_bytes(canonical(deps))
        for root, dirs, names in os.walk(target, followlinks=False):
            os.chown(root, 0, 0)
            Path(root).chmod(0o755)
            for name in dirs + names:
                path = Path(root) / name
                os.chown(path, 0, 0, follow_symlinks=False)
                if not path.is_symlink():
                    path.chmod(path.stat().st_mode & ~0o022)
    # Somente evidencias de codigo, sem bundle ou cache de credenciais no runtime.
    (INPUT / 'source-verification.json').write_bytes(canonical({'source_kind': spec['source_kind'],
        'commits': [spec[k]['sha'] for k in ('baseline', 'candidate')], 'backend_shared_verified': spec['source_kind'] == 'repository-releases'}))


if __name__ == '__main__':
    main()
