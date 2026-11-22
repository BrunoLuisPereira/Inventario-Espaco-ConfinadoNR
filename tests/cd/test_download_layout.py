"""Regression: actual verifier CLI with the pinned action's by-ID download layout."""
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import unittest
import zipfile
from test_cd import archive, SHA

ROOT = Path(__file__).resolve().parents[2]
ARTIFACT_NAME = 'nr33-12-1'


class DownloadLayoutTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.runner = Path(self.temp.name)
        self.candidate = self.runner / 'candidate'
        self.candidate.mkdir()
        self.source = self.runner / 'source.tar.gz'
        self.digest = archive(self.source)
        self.zip = self.runner / 'artifact.zip'
        with zipfile.ZipFile(self.zip, 'w') as bundle:
            bundle.write(self.source, 'release.tar.gz')

    def download_by_id(self, merge):
        # Pinned action src/download-artifact.ts: without name, merge-multiple
        # selects path; otherwise path/artifact.name, even for exactly one ID.
        target = self.candidate if merge else self.candidate / ARTIFACT_NAME
        target.mkdir(exist_ok=True)
        with zipfile.ZipFile(self.zip) as bundle:
            (target / 'release.tar.gz').write_bytes(bundle.read('release.tar.gz'))

    def verify(self):
        env = dict(os.environ, RUNNER_TEMP=str(self.runner), RELEASE_SHA=SHA,
                   ARTIFACT_SHA256=self.digest, PYTHONDONTWRITEBYTECODE='1')
        return subprocess.run([sys.executable, str(ROOT / 'scripts/cd/promocao.py'), 'verificar'],
                              env=env, capture_output=True, text=True, timeout=10)

    def test_configured_download_reaches_exact_package_verifier(self):
        text = (ROOT / '.github/workflows/cd-homologacao.yml').read_text()
        block = text.split('uses: actions/download-artifact@d3f86a106a0bac45b974a628896c90dbdf5c8093', 1)[1].split('      - name:', 1)[0]
        self.assertIn('artifact-ids:', block)
        merge = bool(re.search(r'^\s+merge-multiple:\s+true\s*$', block, re.M))
        self.download_by_id(merge)
        result = self.verify()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual((self.candidate / 'release.tar.gz').read_bytes(), self.source.read_bytes())

    def test_previous_nested_layout_remains_rejected(self):
        self.download_by_id(False)
        result = self.verify()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('arquivo adicional no artefato', result.stderr)

    def test_flat_layout_does_not_allow_extra_or_tampered_files(self):
        self.download_by_id(True)
        extra = self.candidate / 'extra.json'
        extra.write_bytes(b'{}')
        result = self.verify()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('arquivo adicional no artefato', result.stderr)
        extra.unlink()
        package = self.candidate / 'release.tar.gz'
        package.write_bytes(package.read_bytes() + b'TAMPERED')
        result = self.verify()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('hash do pacote divergente', result.stderr)


if __name__ == '__main__':
    unittest.main()
