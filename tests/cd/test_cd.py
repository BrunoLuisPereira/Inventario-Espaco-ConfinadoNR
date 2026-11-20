"""Ensaios direcionados: nenhuma chamada GitHub/AWS ou servico real."""
import ast
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
from unittest.mock import patch
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

if __name__ == "__main__":
    unittest.main()
