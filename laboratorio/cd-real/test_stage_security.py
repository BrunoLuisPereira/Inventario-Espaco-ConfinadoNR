"""Regressoes de staging, sem iniciar servicos ou acessar PostgreSQL."""
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

import fixtures
import stage
from artefato import verificar


class StagingSecurity(unittest.TestCase):
    def test_fixture_destination_is_fixed_and_exclusive(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            with patch.object(fixtures, '__file__', str(root / 'fixtures.py')):
                fixtures.create()
                spec = json.loads((root / 'staging/input.json').read_text())
                for label in ('baseline', 'candidate'):
                    item = spec[label]
                    verificar(root / 'staging' / item['package'], item['sha'], item['sha256'])
                with self.assertRaises(FileExistsError):
                    fixtures.create()

    def test_fixture_cli_rejects_destination_argument(self):
        result = subprocess.run([sys.executable, '-B', fixtures.__file__, '../outside'], capture_output=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn(b'argumentos proibidos', result.stderr)

    def test_invalid_git_revision_never_reaches_command(self):
        for revision in ('../escape', '--help', 'a' * 40 + '\n', 'a' * 39, 'a' * 40 + ';id'):
            with self.subTest(revision=revision), patch.object(stage.subprocess, 'run') as run:
                with self.assertRaises(ValueError):
                    stage.source_check({'source_kind': 'repository-releases'}, {}, revision)
                run.assert_not_called()

    def test_invalid_release_never_reaches_filesystem(self):
        spec = {'source_kind': 'fixtures', 'baseline': {'sha': '../outside'}}
        with patch.object(stage, 'load_spec', return_value=spec), patch.object(stage, 'verificar') as verify:
            with self.assertRaises(ValueError):
                stage.main()
            verify.assert_not_called()

    def test_git_file_name_cannot_be_used_as_revision_or_path_escape(self):
        for name in ('backend/src/../escape.js', 'backend/src/a.js\n--help', 'backend/src/a;id.js'):
            files = {name: b'', 'backend/package.json': b'{}', 'backend/package-lock.json': b'{}'}
            with self.subTest(name=name), patch.object(stage.subprocess, 'run'), patch.object(
                    stage.subprocess, 'check_output', return_value=name + '\n') as output:
                with self.assertRaises(ValueError):
                    stage.source_check({'source_kind': 'repository-releases'}, files, 'a' * 40)
                self.assertEqual(output.call_count, 1)


if __name__ == '__main__':
    unittest.main(verbosity=2)
