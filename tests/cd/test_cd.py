"""Ensaios direcionados: nenhuma chamada GitHub/AWS ou servico real."""
import base64
import copy
import datetime as dt
import hashlib
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tarfile
import tempfile
import textwrap
import unittest
from unittest.mock import Mock, patch
import urllib.error

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts/cd"))
from contrato import Bloqueado, ambiente_github, canonical, prontidao
from artefato import verificar, criar, digest
from github_aws import Ausente, configurar, implantar
from servidor import Lock, transacao, SCHEMA_SQL

SHA, OLD = "a" * 40, "b" * 40
DOC = json.loads((ROOT / "infra/cd/ssm-document.json").read_text())
NOW = dt.datetime(2026, 11, 20, 12, tzinfo=dt.timezone.utc)

def fixture_files():
    return {"backend/package.json": b"{}", "backend/package-lock.json": b"{}",
            "backend/src/server.js": b"// SYNTHETIC", "shared/permissoes.json": b"{}",
            "shared/espacoConfinado.mjs": b"// SYNTHETIC",
            "frontend/index.html": b"<html>SYNTHETIC</html>", "frontend/release.json": canonical({"sha": SHA})}

def archive(path, additions=(), mutate=None):
    files = fixture_files()
    manifest = {"protocol": 1, "sha": SHA, "approval": "NOT_VERIFIED", "deployEligible": False,
                "files": {n: {"size": len(b), "sha256": digest(b)} for n, b in files.items()}}
    if mutate:
        mutate(manifest, files)
    with tarfile.open(path, "w:gz") as t:
        for n, b in [*files.items(), ("manifest.json", canonical(manifest))]:
            e = tarfile.TarInfo(n); e.size = len(b); e.mode = 0o644
            t.addfile(e, io.BytesIO(b))
        for name, kind in additions:
            e = tarfile.TarInfo(name); e.type = kind
            if kind in (tarfile.SYMTYPE, tarfile.LNKTYPE):
                e.linkname = "/tmp/SYNTHETIC"
            t.addfile(e, io.BytesIO())
    return digest(path.read_bytes())

def receipt():
    return {"protocol": 1, "release_sha": SHA, "artifact_sha256": "c" * 64,
            "approved": True, "maintenance_authorized": True, "writers_inventory_complete": True,
            "rollback_tested": True, "previous_sha": OLD, "schema_compatible_shas": [SHA, OLD],
            "schema_sha256": "d" * 64, "valid_until": (NOW + dt.timedelta(hours=1)).isoformat(),
            "backup": {"restore_tested": True, "set_id": "SYNTHETIC", "manifest_sha256": "e" * 64,
                       "captured_at": (NOW - dt.timedelta(hours=1)).isoformat(), "verified_at": NOW.isoformat()}}

class Artifacts(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / "candidate.tar.gz"
    def test_valid_without_extraction(self):
        h = archive(self.path)
        m, files = verificar(self.path, SHA, h)
        self.assertFalse(m["deployEligible"])
        self.assertEqual(len(files), 7)
        self.assertEqual(len(list(Path(self.temp.name).iterdir())), 1)
    def test_reject_links_paths_duplicates_and_env(self):
        for name, kind in [("../escape", tarfile.REGTYPE), ("/absolute", tarfile.REGTYPE),
                           ("backend/.env", tarfile.REGTYPE), ("frontend/node_modules/x.js", tarfile.REGTYPE),
                           ("frontend/link.js", tarfile.SYMTYPE), ("frontend/link.js", tarfile.LNKTYPE),
                           ("frontend/index.html", tarfile.REGTYPE)]:
            with self.subTest(name=name, kind=kind):
                archive(self.path, [(name, kind)])
                with self.assertRaises(Exception):
                    verificar(self.path, SHA)
    def test_hash_sha_and_sensitive_content(self):
        h = archive(self.path)
        for release, expected in [(OLD, h), (SHA, "0" * 64)]:
            with self.subTest(release=release, expected=expected), self.assertRaises(Bloqueado):
                verificar(self.path, release, expected)
        archive(self.path, mutate=lambda m, f: f.update({"frontend/secret.js": b"-----BEGIN PRIVATE KEY-----"}))
        with self.assertRaises(Bloqueado):
            verificar(self.path, SHA)
    def test_manifest_cannot_authorize(self):
        archive(self.path, mutate=lambda m, f: m.update(deployEligible=True))
        with self.assertRaises(Bloqueado):
            verificar(self.path, SHA)
    def test_missing_shared_rejected_even_with_matching_inventory(self):
        for missing in ("shared/permissoes.json", "shared/espacoConfinado.mjs"):
            def omit(manifest, files):
                del files[missing]
                del manifest["files"][missing]
            archive(self.path, mutate=omit)
            with self.subTest(missing=missing), self.assertRaisesRegex(Bloqueado, missing):
                verificar(self.path, SHA)

    def pack_fixture(self, source):
        root = Path(self.temp.name)
        dist = root / "dist"
        dist.mkdir()
        (dist / "index.html").write_text("SYNTHETIC")
        listing = b"\0".join(b"100644 blob " + hashlib.sha1(b).hexdigest().encode() + b"\t" + n.encode()
                             for n, b in source.items()) + b"\0"
        blobs = {hashlib.sha1(b).hexdigest(): b for b in source.values()}
        def git(args, **kwargs):
            if args[0] == "node": return "v24.22.3\n"
            if args[0] == "npm": return "11.19.1\n"
            if "ls-tree" in args: return listing
            if "cat-file" in args: return blobs[args[-1]]
            return ("f" * 40 if args[-1].endswith("^{tree}") else SHA) + "\n"
        with patch("artefato.subprocess.check_output", side_effect=git):
            return criar(root, SHA, dist, self.path)

    def test_pack_shared_and_real_relative_require(self):
        source = {n: b for n, b in fixture_files().items() if not n.startswith("frontend/")}
        for name in ("backend/src/utils/permissoes.js", "shared/permissoes.json", "shared/espacoConfinado.mjs"):
            source[name] = (ROOT / name).read_bytes()
        result = self.pack_fixture(source)
        manifest, files = verificar(self.path, SHA, result["sha256"])
        installed = Path(self.temp.name) / "isolated-release"
        # Materializar somente os arquivos ja aprovados pelo verificador, sem extractall.
        for name, data in files.items():
            dest = installed / name
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(data)
        for name in ("shared/permissoes.json", "shared/espacoConfinado.mjs"):
            self.assertEqual(files[name], (ROOT / name).read_bytes())
            self.assertEqual(manifest["files"][name]["sha256"], digest(files[name]))
        module = installed / "backend/src/utils/permissoes.js"
        code = ("const assert = require('node:assert/strict');"
                "const m = require(process.argv[1]);"
                "const data = require(process.argv[2]);"
                "assert.deepEqual(m.perfis, data.perfis);"
                "assert.equal(typeof m.pode, 'function');")
        args = ["node", "-e", code, str(module), str(installed / "shared/permissoes.json")]
        success = subprocess.run(args, cwd=installed / "backend", capture_output=True, text=True, timeout=10)
        self.assertEqual(success.returncode, 0, success.stderr)
        # Novo processo: nao reutilizar o cache require da verificacao positiva.
        (installed / "shared/permissoes.json").unlink()
        failure = subprocess.run(args, cwd=installed / "backend", capture_output=True, text=True, timeout=10)
        self.assertNotEqual(failure.returncode, 0)
        self.assertIn("MODULE_NOT_FOUND", failure.stderr)
        self.assertIn("../../../shared/permissoes.json", failure.stderr)

    def test_missing_shared_source_never_writes_package(self):
        source = {n: b for n, b in fixture_files().items()
                  if not n.startswith("frontend/") and n != "shared/permissoes.json"}
        with self.assertRaisesRegex(Bloqueado, "shared/permissoes.json"):
            self.pack_fixture(source)
        self.assertFalse(self.path.exists())
        self.assertFalse(self.path.with_suffix(".json").exists())

    def test_installed_manifest_must_include_shared(self):
        from servidor import Runtime
        manifest = {"protocol": 1, "sha": SHA,
                    "files": {n: {"size": len(b), "sha256": digest(b)} for n, b in fixture_files().items()
                              if n != "shared/permissoes.json"}}
        path = Path(self.temp.name) / "release-manifest.json"
        path.write_bytes(canonical(manifest))
        with patch("servidor.seguro", return_value=path), self.assertRaisesRegex(Bloqueado, "shared/permissoes.json"):
            Runtime.release_integrity(None, SHA)

    def test_pack_uses_git_objects_and_dist_only(self):
        root = Path(self.temp.name)
        dist = root / "dist"; dist.mkdir(); (dist / "index.html").write_text("SYNTHETIC")
        files = fixture_files()
        source = {n: b for n, b in files.items() if not n.startswith("frontend/")}
        listing = b"\0".join(b"100644 blob " + hashlib.sha1(b).hexdigest().encode() + b"\t" + n.encode() for n, b in source.items()) + b"\0"
        blobs = {hashlib.sha1(b).hexdigest(): b for b in source.values()}
        def git(args, **kwargs):
            if args[0] == "node": return "v24.22.3\n"
            if args[0] == "npm": return "11.19.1\n"
            if "ls-tree" in args: return listing
            if "cat-file" in args: return blobs[args[-1]]
            return ("f" * 40 if args[-1].endswith("^{tree}") else SHA) + "\n"
        with patch("artefato.subprocess.check_output", side_effect=git):
            criar(root, SHA, dist, self.path)
        self.assertEqual(verificar(self.path, SHA)[0]["sha"], SHA)
        with patch("artefato.subprocess.check_output", side_effect=git), self.assertRaises(Bloqueado):
            criar(root, SHA, dist, self.path)

class Contracts(unittest.TestCase):
    def test_readiness_success(self):
        self.assertEqual(prontidao(receipt(), SHA, "c" * 64, NOW), OLD)
    def test_missing_backup_persistence_authorization_and_schema_fail_closed(self):
        for field in ("approved", "maintenance_authorized", "writers_inventory_complete", "rollback_tested"):
            r = receipt(); r[field] = False
            with self.subTest(field=field), self.assertRaises(Bloqueado):
                prontidao(r, SHA, "c" * 64, NOW)
        r = receipt(); r["backup"]["restore_tested"] = False
        with self.assertRaises(Bloqueado): prontidao(r, SHA, "c" * 64, NOW)
        r = receipt(); r["schema_compatible_shas"] = [SHA]
        with self.assertRaises(Bloqueado): prontidao(r, SHA, "c" * 64, NOW)
    def test_expired_and_old_backup(self):
        for field, value in [("valid_until", (NOW - dt.timedelta(seconds=1)).isoformat()), ("artifact_sha256", "0" * 64)]:
            r = receipt(); r[field] = value
            with self.subTest(field=field), self.assertRaises(Bloqueado): prontidao(r, SHA, "c" * 64, NOW)
        r = receipt(); r["backup"]["captured_at"] = (NOW - dt.timedelta(hours=25)).isoformat()
        with self.assertRaises(Bloqueado): prontidao(r, SHA, "c" * 64, NOW)
    def test_environment_manual_approval_and_main_only(self):
        env = {"name": "homologacao", "protection_rules": [{"type": "required_reviewers", "reviewers": [{"id": 1}]}],
               "deployment_branch_policy": {"custom_branch_policies": True}}
        branches = {"total_count": 1, "branch_policies": [{"name": "main", "type": "branch"}]}
        ambiente_github(env, branches)
        for bad in ({}, {**env, "protection_rules": []}):
            with self.assertRaises(Bloqueado): ambiente_github(bad, branches)
        branches["branch_policies"][0]["name"] = "*"
        with self.assertRaises(Bloqueado): ambiente_github(env, branches)
    def test_oidc_and_document_are_restricted(self):
        template = json.loads((ROOT / "infra/cd/iam-policies.template.json").read_text())
        eq = template["github_oidc_trust"]["Statement"][0]["Condition"]["StringEquals"]
        self.assertEqual(eq["token.actions.githubusercontent.com:aud"], "sts.amazonaws.com")
        self.assertEqual(eq["token.actions.githubusercontent.com:sub"], "repo:BrunoLuisPereira/Inventario-Espaco-ConfinadoNR:environment:homologacao")
        self.assertEqual(DOC["mainSteps"][0]["inputs"]["runCommand"], ["exec /usr/bin/python3 /usr/local/lib/nr33-cd/servidor.py"])
        self.assertTrue(all(p["interpolationType"] == "ENV_VAR" for p in DOC["parameters"].values()))
    def test_sql_is_catalog_read_only(self):
        import re
        self.assertIsNone(re.search(r"\b(?:INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE)\b", SCHEMA_SQL, re.I))

class EC2Identity(unittest.TestCase):
    def setUp(self):
        self.config = {"account_id": "792440910201", "instance_role_name": "NR33-EC2-SSM-Role"}
        self.identity = {"Account": "792440910201", "Arn": "arn:aws:sts::792440910201:assumed-role/NR33-EC2-SSM-Role/i-0123456789abcdef0"}

    def validate(self, identity=None, config=None):
        from servidor import validar_identidade_ec2
        validar_identidade_ec2(self.config if config is None else config,
                              self.identity if identity is None else identity)

    def test_approved_identity(self):
        self.validate()
        identity = dict(self.identity, Arn=self.identity["Arn"].replace("i-0123456789abcdef0", "i-01234567"))
        self.validate(identity)

    def test_wrong_account(self):
        for identity in (dict(self.identity, Account="111111111111"),
                         dict(self.identity, Arn=self.identity["Arn"].replace("792440910201", "111111111111"))):
            with self.subTest(identity=identity), self.assertRaises(Bloqueado):
                self.validate(identity)
        with self.assertRaises(Bloqueado):
            self.validate(config=dict(self.config, account_id="111111111111"))

    def test_wrong_role(self):
        for role in ("nr33-hml-ec2-cd", "NR33-EC2-SSM-Role-extra", "NR33-GitHub-CD-Homologacao"):
            with self.subTest(role=role), self.assertRaises(Bloqueado):
                self.validate(dict(self.identity, Arn=self.identity["Arn"].replace("NR33-EC2-SSM-Role", role)))
            with self.assertRaises(Bloqueado):
                self.validate(config=dict(self.config, instance_role_name=role))

    def test_invalid_arn(self):
        prefix = "arn:aws:sts::792440910201:assumed-role/NR33-EC2-SSM-Role/"
        for arn in (None, 123, "", prefix, prefix + "session", prefix + "i-0123456789abcdef0/extra",
                    prefix + "i-0123456789abcdef0\n", prefix + "i-0123456789ABCDEF0",
                    prefix + "i-012345678", prefix.replace("arn:aws:", "arn:aws-cn:") + "i-01234567",
                    "arn:aws:iam::792440910201:role/NR33-EC2-SSM-Role"):
            with self.subTest(arn=arn), self.assertRaises(Bloqueado):
                self.validate(dict(self.identity, Arn=arn))
        for identity in ({}, [], "invalid"):
            with self.subTest(identity=identity), self.assertRaises(Bloqueado):
                self.validate(identity)

    def preflight_host(self, identity):
        from servidor import Runtime, BASE, ENV_FILE
        # Testar preflight sem executar o construtor nem acessar o host real.
        host = Runtime.__new__(Runtime)
        host.config, host.previous = dict(self.config), OLD
        host.user = Mock(pw_name="nr33_test")
        for method in ("authorize", "mount_release", "release_integrity", "schema"):
            self.enterContext(patch.object(host, method))
        self.enterContext(patch.object(host, "units", return_value={
            "LoadState": "loaded", "ActiveState": "active", "User": "nr33_test",
            "KillMode": "control-group", "EnvironmentFiles": str(ENV_FILE)}))
        self.enterContext(patch("servidor.seguro"))
        front = self.enterContext(patch("servidor.FRONT"))
        front.is_symlink.return_value = True
        front.resolve.return_value = BASE / OLD / "frontend"
        dropin = self.enterContext(patch("servidor.DROPIN"))
        dropin.read_bytes.return_value = str(BASE / OLD / "backend").encode()

        def command(args, **kwargs):
            if args == ["node", "--version"]:
                return "v24.22.3"
            if args == ["aws", "sts", "get-caller-identity", "--output", "json", "--no-cli-pager"]:
                return json.dumps(identity)
            raise AssertionError("comando inesperado no preflight simulado: " + repr(args))

        self.enterContext(patch("servidor.executar", side_effect=command))
        return host

    def test_preflight_blocks_invalid_identity_before_schema(self):
        host = self.preflight_host(dict(self.identity, Account="111111111111"))
        with self.assertRaises(Bloqueado):
            host.preflight()
        host.schema.assert_not_called()

    def test_preflight_valid_identity_reaches_schema(self):
        host = self.preflight_host(self.identity)
        host.preflight()
        host.schema.assert_called_once_with()


@unittest.skipUnless(sys.platform == "linux" and hasattr(os, "geteuid") and os.geteuid() == 0,
                     "permissoes administrativas reais exigem Linux root isolado")
class AdministrativeLogs(unittest.TestCase):
    def setUp(self):
        # /tmp e gravavel por outros e deve continuar rejeitado por seguro().
        self.temp = tempfile.TemporaryDirectory(prefix="nr33-cd-test-", dir="/var/lib")
        self.addCleanup(self.temp.cleanup)
        self.parent = Path(self.temp.name) / "nr33"
        self.parent.mkdir(mode=0o755)
        self.logs = self.parent / "cd-logs"
        self.logs.mkdir(mode=0o700)

    def test_protected_logs_and_atomic_record(self):
        from servidor import Runtime, LOGS, seguro
        self.assertEqual(LOGS, Path("/var/lib/nr33/cd-logs"))
        self.assertEqual(seguro(self.logs, True), self.logs)
        host = Runtime.__new__(Runtime)
        host.release, host.previous, host.artifact = SHA, OLD, "c" * 64
        with patch("servidor.LOGS", self.logs), patch("sys.stdout", new_callable=io.StringIO):
            host.record("SUCCESS")
        files = list(self.logs.iterdir())
        self.assertEqual(len(files), 1)
        self.assertEqual(files[0].stat().st_mode & 0o777, 0o600)
        self.assertEqual(json.loads(files[0].read_text())["status"], "SUCCESS")
        seguro(files[0])

    def test_group_or_other_writable_directory_and_ancestor_rejected(self):
        from servidor import seguro
        for path in (self.logs, self.parent):
            original = path.stat().st_mode & 0o777
            for mode in (0o775, 0o757):
                with self.subTest(path=path, mode=oct(mode)):
                    path.chmod(mode)
                    try:
                        with self.assertRaises(Bloqueado):
                            seguro(self.logs, True)
                    finally:
                        path.chmod(original)

    def test_symlink_directory_and_ancestor_rejected(self):
        from servidor import seguro
        link = Path(self.temp.name) / "link"
        link.symlink_to(self.parent, target_is_directory=True)
        for path in (link, link / "cd-logs"):
            with self.subTest(path=path), self.assertRaises(Bloqueado):
                seguro(path, True)

    def test_non_root_owner_rejected(self):
        from servidor import seguro
        os.chown(self.logs, 65534, 65534)
        with self.assertRaises(Bloqueado):
            seguro(self.logs, True)

    def test_preflight_accepts_protected_logs(self):
        self.run_preflight_logs(False)

    def test_preflight_rejects_writable_logs_before_services(self):
        self.logs.chmod(0o775)
        self.run_preflight_logs(True)

    def run_preflight_logs(self, blocked):
        import servidor
        # Reutiliza somente a fixture simulada; seguro() real valida os logs.
        real_seguro = servidor.seguro
        fixture = EC2Identity()
        fixture.setUp()
        self.addCleanup(fixture.doCleanups)
        host = fixture.preflight_host(fixture.identity)
        def check(path, directory=False):
            if Path(path) == self.logs:
                return real_seguro(path, directory)
        servidor.seguro.side_effect = check
        command = servidor.executar
        with patch("servidor.LOGS", self.logs):
            if blocked:
                with self.assertRaises(Bloqueado):
                    host.preflight()
                host.schema.assert_not_called()
                command.assert_not_called()
            else:
                host.preflight()
                host.schema.assert_called_once_with()
            servidor.seguro.assert_any_call(self.logs, True)


class SharedIAM(unittest.TestCase):
    def setUp(self):
        self.policy = json.loads((ROOT / "infra/cd/iam-policies.template.json").read_text())

    def test_github_backup_deny_is_preserved(self):
        denies = [s for s in self.policy["github_identity"]["Statement"] if s.get("Sid") == "NeverAccessBackups"]
        self.assertEqual(denies, [{"Sid": "NeverAccessBackups", "Effect": "Deny", "Action": "s3:*",
                                 "Resource": ["arn:aws:s3:::__BACKUP_BUCKET__", "arn:aws:s3:::__BACKUP_BUCKET__/*"]}])
        architecture = self.policy["approved_architecture"]
        self.assertEqual(architecture["backup_bucket"], "nr33-db-backups-792440910201")
        self.assertEqual(architecture["github_role_name"], "NR33-GitHub-CD-Homologacao")

    def test_ec2_s3_is_only_versioned_release_read(self):
        statements = self.policy["ec2_identity"]["Statement"]
        self.assertNotIn("__BACKUP_BUCKET__", json.dumps(statements))
        s3 = [s for s in statements if any(a.startswith("s3:") for a in
              ([s["Action"]] if isinstance(s["Action"], str) else s["Action"]))]
        self.assertEqual(s3, [{"Effect": "Allow", "Action": "s3:GetObjectVersion",
                              "Resource": "arn:aws:s3:::__ARTIFACT_BUCKET__/releases/*"}])
        for statement in statements:
            actions = statement["Action"]
            self.assertNotIn("NotAction", statement)
            self.assertNotIn("*", [actions] if isinstance(actions, str) else actions)

    def test_executor_example_matches_approved_architecture_and_stays_disabled(self):
        config = json.loads((ROOT / "infra/cd/cd.example.json").read_text())
        self.assertIs(config["enabled"], False)
        for key in ("account_id", "region", "artifact_bucket"):
            self.assertEqual(config[key], self.policy["approved_architecture"][key])
        self.assertEqual(config["instance_role_name"], "NR33-EC2-SSM-Role")


class FakeAWS:
    def __init__(self, h, status="Success", defect=None):
        self.h, self.status, self.defect, self.calls = h, status, defect, []
    def call(self, *args):
        self.calls.append(args)
        service, action = args[:2]
        if action == "get-caller-identity":
            return {"Account": "111111111111", "Arn": "arn:aws:sts::111111111111:assumed-role/nr33-hml-cd/SYNTHETIC"}
        if action == "get-public-access-block":
            return {"PublicAccessBlockConfiguration": {k: self.defect != "public" for k in ("BlockPublicAcls", "IgnorePublicAcls", "BlockPublicPolicy", "RestrictPublicBuckets")}}
        if action == "get-bucket-versioning": return {"Status": "Enabled"}
        if action == "get-bucket-ownership-controls": return {"OwnershipControls": {"Rules": [{"ObjectOwnership": "BucketOwnerEnforced"}]}}
        if action == "get-bucket-encryption": return {"ServerSideEncryptionConfiguration": {"Rules": [{"ApplyServerSideEncryptionByDefault": {"SSEAlgorithm": "AES256"}}]}}
        if action == "describe-instance-information":
            return {"InstanceInformationList": [{"InstanceId": "i-00000000000000000", "PlatformType": "Linux", "PingStatus": "Offline" if self.defect == "offline" else "Online"}]}
        if action == "get-document": return {"DocumentVersion": "2" if self.defect == "document" else "1", "Content": json.dumps(DOC)}
        if action == "head-object": raise Ausente("SYNTHETIC")
        if action == "put-object":
            self.assert_write(args)
            return {"VersionId": "SYNTHETIC-version"}
        if action == "send-command": return {"Command": {"CommandId": "00000000-0000-0000-0000-000000000000"}}
        if action == "get-command-invocation": return {"Status": self.status, "ResponseCode": 0}
        raise AssertionError(args)
    def assert_write(self, args):
        assert args[args.index("--if-none-match") + 1] == "*"
        assert args[args.index("--server-side-encryption") + 1] == "AES256"

def env_config():
    return {"CD_ENABLED": "true", "CD_ACCOUNT_ID": "111111111111", "CD_ROLE_ARN": "arn:aws:iam::111111111111:role/nr33-hml-cd",
            "CD_ARTIFACT_BUCKET": "synthetic-cd-bucket", "CD_INSTANCE_ID": "i-00000000000000000", "CD_SSM_DOCUMENT": "nr33-hml-cd-synthetic",
            "CD_SSM_VERSION": "1", "CD_READINESS_SHA256": "e" * 64}

class AWSControl(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / "release.tar.gz"
        self.h = archive(self.path)
    def test_aws_flow_and_success(self):
        aws = FakeAWS(self.h)
        result = implantar(aws, configurar(env_config()), self.path, SHA, self.h, DOC, sleep=lambda _: None)
        self.assertEqual(result["sha"], SHA)
        self.assertEqual(sum(c[1] == "send-command" for c in aws.calls), 1)
        sent = next(c for c in aws.calls if c[1] == "send-command")
        params = json.loads(sent[sent.index("--parameters") + 1])
        self.assertEqual(params["ReadinessSha256"], ["e" * 64])
    def test_fail_before_mutations_when_aws_not_ready(self):
        for defect in ("public", "offline", "document"):
            aws = FakeAWS(self.h, defect=defect)
            with self.subTest(defect=defect), self.assertRaises(Bloqueado):
                implantar(aws, configurar(env_config()), self.path, SHA, self.h, DOC)
            self.assertFalse(any(c[1] in ("put-object", "send-command") for c in aws.calls))
    def test_ssm_failure_does_not_become_success_or_retry(self):
        aws = FakeAWS(self.h, status="Failed")
        with self.assertRaises(Bloqueado): implantar(aws, configurar(env_config()), self.path, SHA, self.h, DOC)
        self.assertEqual(sum(c[1] == "send-command" for c in aws.calls), 1)
    def test_ssm_unknown_state_never_resends(self):
        aws = FakeAWS(self.h, status="InProgress")
        values = iter([0, 0, 1300])
        with self.assertRaises(Bloqueado):
            implantar(aws, configurar(env_config()), self.path, SHA, self.h, DOC, sleep=lambda _: None, clock=lambda: next(values))
        self.assertEqual(sum(c[1] == "send-command" for c in aws.calls), 1)
    def test_configuration_disabled_or_invalid(self):
        for field, value in [("CD_ENABLED", "false"), ("CD_ROLE_ARN", "*"), ("CD_SSM_VERSION", "$LATEST"), ("CD_READINESS_SHA256", "")]:
            env = env_config(); env[field] = value
            with self.subTest(field=field), self.assertRaises(Bloqueado): configurar(env)

class FakeHost:
    release, previous = SHA, OLD
    def __init__(self, defect=None):
        self.defect, self.events, self.on = defect, [], False
    def preflight(self):
        self.events.append("preflight")
        if self.defect in ("backup", "persistence"): raise Bloqueado("precondicao")
    def prepare(self): self.events.append("prepare")
    def authorize(self): self.events.append("authorize")
    def maintenance(self, enabled): self.events.append("maintenance:" + str(enabled)); self.on = enabled
    def stop(self): self.events.append("stop")
    def activate(self, release): self.events.append("activate:" + release)
    def restore(self): self.events.append("restore")
    def start(self): self.events.append("start")
    def health(self, release):
        self.events.append("health:" + release)
        if self.defect == "health" and release == SHA: raise Bloqueado("health")
        if self.defect == "rollback": raise Bloqueado("health")
    def public_health(self, release):
        self.events.append("public:" + release)
        if self.defect == "public" and release == SHA: raise Bloqueado("public")
    def record(self, status): self.events.append(status)

class HostControl(unittest.TestCase):
    def test_rehearsal_returns_via_restore_after_healthy_candidate(self):
        host = FakeHost()
        with patch('servidor.proteger_ensaio_isolado') as guard:
            transacao(host, ensaio_isolado=True)
        self.assertEqual(guard.call_count, 2)
        self.assertLess(host.events.index('health:' + SHA), host.events.index('restore'))
        self.assertLess(host.events.index('restore'), host.events.index('public:' + OLD))
        self.assertEqual(host.events[-1], 'ROLLBACK_REHEARSED_ISOLATED')
        self.assertFalse(host.on)

    def test_rehearsal_guard_blocks_before_host_operations(self):
        host = FakeHost()
        with patch('servidor.proteger_ensaio_isolado', side_effect=Bloqueado('isolation')):
            with self.assertRaises(Bloqueado):
                transacao(host, ensaio_isolado=True)
        self.assertEqual(host.events, [])

    def test_rehearsal_failure_never_records_evidence(self):
        host = FakeHost('rollback')
        with patch('servidor.proteger_ensaio_isolado'):
            with self.assertRaises(Bloqueado):
                transacao(host, ensaio_isolado=True)
        self.assertEqual(host.events[-1], 'MANUAL_RECOVERY_REQUIRED')
        self.assertTrue(host.on)

    def test_success_order(self):
        host = FakeHost(); transacao(host)
        self.assertLess(host.events.index("authorize"), host.events.index("stop"))
        self.assertLess(host.events.index("maintenance:True"), host.events.index("activate:" + SHA))
        self.assertEqual(host.events[-1], "SUCCESS")
    def test_missing_backup_and_mount_never_stop_service(self):
        for defect in ("backup", "persistence"):
            host = FakeHost(defect)
            with self.subTest(defect=defect), self.assertRaises(Bloqueado): transacao(host)
            self.assertNotIn("stop", host.events)
    def test_health_failure_rolls_back_application_only(self):
        host = FakeHost("health")
        with self.assertRaises(Bloqueado): transacao(host)
        self.assertIn("restore", host.events)
        self.assertEqual(host.events[-1], "ROLLED_BACK")
        self.assertFalse(host.on)
    def test_post_maintenance_health_failure_also_rolls_back(self):
        host = FakeHost("public")
        with self.assertRaises(Bloqueado): transacao(host)
        self.assertIn("restore", host.events)
        self.assertEqual(host.events[-1], "ROLLED_BACK")
    def test_failed_rollback_keeps_maintenance(self):
        host = FakeHost("rollback")
        with self.assertRaises(Bloqueado): transacao(host)
        self.assertTrue(host.on)
        self.assertEqual(host.events[-1], "MANUAL_RECOVERY_REQUIRED")
    @unittest.skipUnless(sys.platform == "linux", "flock real exige Linux")
    def test_real_cross_process_lock(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "deploy.lock"
            with Lock(path):
                code = "import sys;sys.path.insert(0,sys.argv[1]);from servidor import Lock;\nwith Lock(sys.argv[2]): pass"
                child = subprocess.run([sys.executable, "-c", code, str(ROOT / "scripts/cd"), str(path)], capture_output=True)
                self.assertNotEqual(child.returncode, 0)
            with Lock(path): pass

class GitHubCI(unittest.TestCase):
    def proof(self):
        text = (ROOT / ".github/workflows/cd-homologacao.yml").read_text()
        code = text.split("          python3 - <<'PY'\n", 1)[1].split("\n          PY", 1)[0]
        return textwrap.dedent(code)
    def run_case(self, case):
        code = self.proof()
        required = {"Backend": ["Instalar dependencias", "Verificar sintaxe", "Testes unitarios selecionados"],
                    "Frontend": ["Instalar dependencias", "Executar ESLint", "Testes unitarios selecionados", "Gerar build"],
                    "Seguranca (backend)": ["Auditar dependencias de producao e desenvolvimento"],
                    "Seguranca (frontend)": ["Auditar dependencias de producao e desenvolvimento"]}
        run = {"id": 1, "run_number": 1, "head_sha": SHA, "head_branch": "main", "event": "push", "workflow_id": 9,
               "path": ".github/workflows/ci.yml", "status": "completed", "conclusion": "success", "run_attempt": 1,
               "head_repository": {"full_name": "BrunoLuisPereira/Inventario-Espaco-ConfinadoNR"}}
        jobs = [{"name": n, "head_sha": SHA, "run_id": 1, "run_attempt": 1, "status": "completed", "conclusion": "success",
                 "steps": [{"name": s, "status": "completed", "conclusion": "success"} for s in steps]} for n, steps in required.items()]
        runs = [run]
        if case == "pr": run["event"] = "pull_request"
        if case == "other-sha": run["head_sha"] = OLD
        if case == "other-branch": run["head_branch"] = "feature"
        if case in ("failure", "cancelled"): run["conclusion"] = case
        if case == "pending": run["status"] = "in_progress"
        if case == "missing-job": jobs.pop()
        if case == "failed-job": jobs[0]["conclusion"] = "failure"
        if case == "skipped-step": jobs[0]["steps"][0]["conclusion"] = "skipped"
        if case == "missing-step": jobs[0]["steps"].pop()
        if case == "no-ci": runs = []
        if case == "duplicate": runs = [run, copy.deepcopy(run)]
        class Response:
            status = 200
            def __init__(self, data): self.data = data
            def __enter__(self): return self
            def __exit__(self, *_): pass
            def read(self, _): return b"{" if case == "invalid-json" else json.dumps(self.data).encode()
        class Opener:
            def open(self, req, timeout):
                if case.startswith("http-"):
                    raise urllib.error.HTTPError(req.full_url, int(case[-3:]), "SYNTHETIC", {}, None)
                if case == "timeout": raise TimeoutError("SYNTHETIC")
                url = req.full_url.split("?")[0]
                if url.endswith("branches/main"): return Response({"commit": {"sha": OLD if case == "head-mismatch" else SHA}})
                if url.endswith("actions/workflows/ci.yml"): return Response({"path": ".github/workflows/ci.yml", "name": "CI", "state": "active", "id": 9})
                if url.endswith("workflows/9/runs"): return Response({"workflow_runs": runs, "total_count": len(runs)})
                if url.endswith("attempts/1/jobs"): return Response({"jobs": jobs, "total_count": len(jobs)})
                if url.endswith("actions/runs/1"): return Response(run)
                raise AssertionError(url)
        with tempfile.TemporaryDirectory() as temp:
            env = {"RELEASE_SHA": "" if case == "missing-sha" else "invalid" if case == "invalid-sha" else SHA,
                   "GITHUB_REPOSITORY": "BrunoLuisPereira/Inventario-Espaco-ConfinadoNR", "DISPATCH_EVENT": "workflow_dispatch",
                   "DISPATCH_REF": "refs/heads/main", "GH_READ_TOKEN": "SYNTHETIC", "GITHUB_STEP_SUMMARY": str(Path(temp) / "summary")}
            with patch.dict(os.environ, env, clear=True), patch("urllib.request.build_opener", return_value=Opener()), patch("sys.stdout", new_callable=io.StringIO):
                try:
                    exec(compile(code, "<real-workflow>", "exec"), {})
                    return True
                except SystemExit:
                    return False
    def test_real_workflow_positive(self):
        self.assertTrue(self.run_case("valid"))
    def test_real_workflow_negative_cases(self):
        for case in ("missing-sha", "invalid-sha", "head-mismatch", "no-ci", "failure", "cancelled", "pending", "pr",
                     "other-sha", "other-branch", "missing-job", "failed-job", "missing-step", "skipped-step", "duplicate",
                     "http-403", "http-404", "http-500", "timeout", "invalid-json"):
            with self.subTest(case=case):
                self.assertFalse(self.run_case(case))
    def test_no_automatic_trigger_and_scoped_oidc(self):
        text = (ROOT / ".github/workflows/cd-homologacao.yml").read_text()
        self.assertEqual(text.count("id-token: write"), 1)
        self.assertIn("default: false", text)
        self.assertNotIn("  push:", text)
        self.assertIn("cancel-in-progress: false", text)
        self.assertIn("environment:\n      name: homologacao", text)
        self.assertIn("allowed-account-ids:", text)


class PersistenceIdentity(unittest.TestCase):
    def test_mount_identity_and_permissions(self):
        from servidor import montar_identidade
        with tempfile.TemporaryDirectory() as temp:
            source = Path(temp) / "persistent"
            source.mkdir(mode=0o700)
            expected = {"filesystems": [{"target": str(source), "options": "rw,nosuid,nodev,noexec"}]}
            with patch("servidor.executar", return_value=json.dumps(expected)):
                result = montar_identidade(source, source, os.getuid())
                self.assertEqual(result["inode"], source.stat().st_ino)
            for metadata in ({"filesystems": []}, {"filesystems": [{"target": str(source), "options": "ro"}]},
                             {"filesystems": [{"target": "/different", "options": "rw"}]}):
                with self.subTest(metadata=metadata), patch("servidor.executar", return_value=json.dumps(metadata)), self.assertRaises(Bloqueado):
                    montar_identidade(source, source, os.getuid())
    def test_wrong_source_and_unwritable_permissions(self):
        from servidor import montar_identidade
        with tempfile.TemporaryDirectory() as temp:
            source, target = Path(temp) / "source", Path(temp) / "target"
            source.mkdir(mode=0o700); target.mkdir(mode=0o700)
            metadata = {"filesystems": [{"target": str(target), "options": "rw"}]}
            with patch("servidor.executar", return_value=json.dumps(metadata)), self.assertRaises(Bloqueado):
                montar_identidade(source, target, os.getuid())
            source.chmod(0o500)
            metadata["filesystems"][0]["target"] = str(source)
            with patch("servidor.executar", return_value=json.dumps(metadata)), self.assertRaises(Bloqueado):
                montar_identidade(source, source, os.getuid())
    def test_symlink_rejected_before_inspection(self):
        from servidor import montar_identidade
        with tempfile.TemporaryDirectory() as temp:
            source, target = Path(temp) / "source", Path(temp) / "link"
            source.mkdir(mode=0o700); target.symlink_to(source)
            with patch("servidor.executar") as command, self.assertRaises(Bloqueado):
                montar_identidade(source, target, os.getuid())
            command.assert_not_called()
    def test_inspection_failure_is_not_acceptance(self):
        from servidor import montar_identidade
        with tempfile.TemporaryDirectory() as temp:
            source = Path(temp)
            with patch("servidor.executar", side_effect=Bloqueado("inspection failed")), self.assertRaises(Bloqueado):
                montar_identidade(source, source, os.getuid())


class CLISecurity(unittest.TestCase):
    def test_sha_rejected_before_any_git_command(self):
        from contrato import sha
        for value in ("--help", "a" * 39, "a" * 40 + "^{tree}", None, 123):
            with self.subTest(value=value), patch("artefato.subprocess.check_output") as command, self.assertRaises(Bloqueado):
                criar(".", value, "frontend/dist", "unused.tar.gz")
            command.assert_not_called()
        self.assertEqual(sha(SHA), SHA)
    def test_runner_package_and_links(self):
        from contrato import pacote_runner
        with tempfile.TemporaryDirectory() as temp, patch.dict(os.environ, {"RUNNER_TEMP": temp}):
            root = Path(temp)
            self.assertEqual(pacote_runner(), root / "release.tar.gz")
            self.assertEqual(pacote_runner(candidate=True), root / "candidate/release.tar.gz")
            source = root / "source"; source.write_text("SYNTHETIC")
            package = root / "release.tar.gz"; package.symlink_to(source)
            with self.assertRaises(Bloqueado): pacote_runner()
            package.unlink(); os.link(source, package)
            with self.assertRaises(Bloqueado): pacote_runner()
        with patch.dict(os.environ, {"RUNNER_TEMP": "."}):
            with self.assertRaises(Bloqueado): pacote_runner()
    def test_cli_refuses_arbitrary_paths_without_aws_or_git(self):
        with tempfile.TemporaryDirectory() as temp:
            env = dict(os.environ, RUNNER_TEMP=temp, CD_ENABLED="false")
            cases = [
                ["artefato.py", "criar", "--sha", SHA, "--package", "/etc/passwd"],
                ["artefato.py", "verificar", "--sha", SHA, "--package", str(Path(temp) / "../outside.tar.gz")],
                ["artefato.py", "criar", "--sha", SHA, "--package", str(Path(temp) / "release.tar.gz"), "--root", "/etc"],
                ["github_aws.py", "implantar", "--sha", SHA, "--digest", "c" * 64, "--package", "/etc/passwd"],
                ["github_aws.py", "implantar", "--document", "/etc/passwd"],
            ]
            for args in cases:
                with self.subTest(args=args):
                    result = subprocess.run([sys.executable, str(ROOT / "scripts/cd" / args[0]), *args[1:]],
                                            env=env, capture_output=True, text=True, timeout=5)
                    self.assertNotEqual(result.returncode, 0)
                    self.assertNotIn("Traceback", result.stderr)
            text = (ROOT / ".github/workflows/cd-homologacao.yml").read_text()
            self.assertIn("permissions: {}", text)
            self.assertEqual(text.count("      actions: read"), 2)

if __name__ == "__main__":
    unittest.main()
