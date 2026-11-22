"""Testes do adaptador; integracao exige container com PostgreSQL local preparado."""
import copy
import json
import os
import signal
import subprocess
from pathlib import Path
import tempfile
import time
import unittest
from unittest.mock import patch

from adaptador import (INPUT, RealRuntime, digest, inventory, load_spec, guard)
from contrato import Bloqueado
import servidor as s
from stage import source_check


class AdapterTests(unittest.TestCase):
    def setUp(self):
        self.spec = load_spec(INPUT / 'input.json')
        self.ops = RealRuntime(self.spec, Path('/etc/nr33/lab-schema.sha256').read_text().strip())

    def test_real_postgres17_schema_and_readonly(self):
        self.assertEqual(json.loads(self.ops.sql(s.SCHEMA_SQL))['major'], 17)
        self.ops.schema()
        with self.assertRaises(Bloqueado):
            self.ops.sql('CREATE TABLE should_never_exist(id int)')

    def test_schema_mismatch_fails(self):
        self.ops.receipt['schema_sha256'] = 'f' * 64
        with self.assertRaises(Bloqueado):
            self.ops.schema()

    def test_actual_schema_change_is_detected(self):
        admin = ['/usr/sbin/runuser', '-u', 'postgres', '--', 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-d', 'inventario_nr33_homolog', '-c']
        subprocess.run(admin + ['CREATE TABLE lab_schema_tamper(id int)'], check=True, capture_output=True)
        try:
            with self.assertRaises(Bloqueado):
                self.ops.schema()
        finally:
            subprocess.run(admin + ['DROP TABLE lab_schema_tamper'], check=True, capture_output=True)
        self.ops.schema()

    def test_real_remaining_writer_blocks_stop(self):
        process = subprocess.Popen(['/usr/sbin/runuser', '-u', 'nr33lab', '--', 'psql', '-X', '-d',
                                    'inventario_nr33_homolog', '-c', 'SELECT pg_sleep(15)'],
                                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
        try:
            for _ in range(30):
                if self.ops.sql("SELECT count(*) FROM pg_stat_activity WHERE usename='nr33lab'") != '0':
                    break
                time.sleep(0.1)
            else:
                self.fail('conexao real nao observada')
            with self.assertRaisesRegex(Bloqueado, 'outro escritor'):
                self.ops.stop()
        finally:
            subprocess.run(['/usr/sbin/runuser', '-u', 'nr33lab', '--', 'psql', '-X', '-d',
                            'inventario_nr33_homolog', '-c',
                            "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE usename='nr33lab' AND pid<>pg_backend_pid()"],
                           check=True, capture_output=True)
            if process.poll() is None:
                os.killpg(process.pid, signal.SIGTERM)
            process.wait(timeout=10)
            self.ops.start()
            self.ops.health(self.ops.previous)

    def test_real_data_invariants(self):
        self.ops.check_data()
        altered = copy.deepcopy(self.spec)
        altered['data_checks'][0]['sha256'] = 'f' * 64
        self.ops.spec = altered
        with self.assertRaises(Bloqueado):
            self.ops.check_data()

    def test_remote_postgres_configuration_rejected(self):
        path = Path('/etc/nr33/pg_service.conf')
        original = path.read_bytes()
        try:
            path.write_bytes(original.replace(b'/var/run/postgresql', b'production.invalid'))
            with self.assertRaises(Bloqueado):
                self.ops.sql('SELECT 1')
        finally:
            path.write_bytes(original)

    def test_tampered_candidate_and_dependencies_rejected(self):
        for path in (s.BASE / self.ops.release / 'frontend/index.html',
                     s.BASE / self.ops.release / 'backend/node_modules/lab-tamper.txt'):
            original = path.read_bytes() if path.exists() else None
            try:
                path.write_bytes(b'TAMPERED')
                with self.assertRaises(Bloqueado):
                    self.ops.prepare()
            finally:
                if original is None:
                    path.unlink()
                else:
                    path.write_bytes(original)
        self.ops.prepare()

    def test_wrong_baseline_rejected_before_service_change(self):
        self.ops.previous = self.ops.release
        with self.assertRaises(Bloqueado):
            self.ops.preflight()
        self.assertEqual(self.ops.units()['ActiveState'], 'active')

    def test_process_from_another_release_rejected(self):
        with patch.object(s.Runtime, '_health_once'), patch.object(self.ops, 'units', return_value={'MainPID': str(os.getpid())}):
            with self.assertRaises(Bloqueado):
                self.ops._health_once(self.ops.previous)

    def test_guard_rejects_aws_context(self):
        with patch.dict(os.environ, {'AWS_ACCESS_KEY_ID': 'LOCAL-TEST-NOT-A-KEY'}):
            with self.assertRaises(Bloqueado):
                guard()

    def test_guard_rejects_network_and_external_mount(self):
        # Outras barreiras reais continuam executando; somente resposta findmnt e substituida.
        with patch.object(s, 'executar', return_value=json.dumps({'filesystems': [{'target': '/lab-input'}]})):
            with self.assertRaises(Bloqueado):
                guard()
        with patch.object(s, 'proteger_ensaio_isolado', side_effect=Bloqueado('network')):
            with self.assertRaises(Bloqueado):
                guard()

    def test_upload_inventory_detects_loss_mutation_and_links(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            path = root / 'sentinel'
            path.write_bytes(b'before')
            before = inventory(root)
            path.write_bytes(b'after')
            self.assertNotEqual(before, inventory(root))
            path.unlink()
            self.assertNotEqual(before, inventory(root))
            path.symlink_to('/etc/passwd')
            with self.assertRaises(Bloqueado):
                inventory(root)

    def test_package_digest_and_source_kind_required(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / 'spec.json'
            for field, value in [('source_kind', 'synthetic-promoted-to-real'), ('data_checks', [])]:
                spec = copy.deepcopy(self.spec)
                spec[field] = value
                path.write_text(json.dumps(spec))
                with self.assertRaises(Bloqueado):
                    load_spec(path)
        altered = copy.deepcopy(self.spec)
        altered['candidate']['sha256'] = 'f' * 64
        self.ops.spec = altered
        with self.assertRaises(Bloqueado):
            self.ops.authorize()

    def test_git_source_provenance_rejects_changed_or_missing_code(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            files = {'backend/package.json': b'{}', 'backend/package-lock.json': b'{}',
                     'backend/src/server.js': b'// fixture source', 'shared/permissoes.json': b'{}'}
            for name, data in files.items():
                path = root / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(data)
            subprocess.run(['git', 'init', '-q', str(root)], check=True)
            subprocess.run(['git', '-C', str(root), 'add', '.'], check=True)
            subprocess.run(['git', '-C', str(root), '-c', 'user.name=Lab', '-c', 'user.email=lab@example.invalid',
                            'commit', '-qm', 'fixture only'], check=True)
            release = subprocess.check_output(['git', '-C', str(root), 'rev-parse', 'HEAD'], text=True).strip()
            spec = {'source_kind': 'repository-releases'}
            source_check(spec, files, release, root / '.git')
            for mutate in (lambda f: f.update({'backend/src/server.js': b'TAMPERED'}),
                           lambda f: f.pop('shared/permissoes.json')):
                changed = dict(files)
                mutate(changed)
                with self.assertRaises(Bloqueado):
                    source_check(spec, changed, release, root / '.git')


if __name__ == '__main__':
    unittest.main(verbosity=2)
