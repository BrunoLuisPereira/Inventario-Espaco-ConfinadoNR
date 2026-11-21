"""Executor Linux instalado pelo administrador. Nunca executar a copia contida em artefato."""
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import pwd
import re
import shutil
import signal
import subprocess
import tempfile
import uuid
from contrato import exigir, sha, canonical, prontidao, Bloqueado
from artefato import verificar, nome, exigir_arquivos_obrigatorios

BASE = Path("/opt/nr33/releases")
FRONT = Path("/var/www/nr33/current")
DROPIN = Path("/etc/systemd/system/nr33-backend.service.d/50-release.conf")
ENV_FILE = Path("/etc/nr33/backend.env")
PERSIST = Path("/var/lib/nr33/uploads")
MAINTENANCE = Path("/run/nr33/maintenance")
LOGS = Path("/var/lib/nr33/cd-logs")

# Somente catalogos, sem registros de usuarios ou dados operacionais.
SCHEMA_SQL = """
SELECT json_build_object(
 'database', current_database(), 'major', current_setting('server_version_num')::int / 10000,
 'columns', (SELECT json_agg(row_to_json(x)) FROM (
  SELECT table_name,column_name,ordinal_position,data_type,udt_name,is_nullable,column_default,
         character_maximum_length,numeric_precision,numeric_scale,is_identity,identity_generation
  FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position) x),
 'relations', (SELECT json_agg(row_to_json(x)) FROM (
  SELECT c.relname,c.relkind,c.relrowsecurity,c.relforcerowsecurity,pg_get_userbyid(c.relowner) AS owner,c.relacl
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' ORDER BY c.relname) x),
 'constraints', (SELECT json_agg(row_to_json(x)) FROM (
  SELECT c.conname,c.conrelid::regclass::text AS relation,c.contype,c.convalidated,pg_get_constraintdef(c.oid) AS definition
  FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='public' ORDER BY relation,c.conname) x),
 'indexes', (SELECT json_agg(row_to_json(x)) FROM (
  SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public' ORDER BY tablename,indexname) x),
 'functions', (SELECT json_agg(row_to_json(x)) FROM (
  SELECT p.proname,pg_get_function_identity_arguments(p.oid) AS arguments,pg_get_functiondef(p.oid) AS definition,
         pg_get_userbyid(p.proowner) AS owner,p.proacl
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind IN ('f','p')
  ORDER BY p.proname,arguments) x),
 'triggers', (SELECT json_agg(row_to_json(x)) FROM (
  SELECT c.relname,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid) AS definition
  FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND NOT t.tgisinternal ORDER BY c.relname,t.tgname) x),
 'extensions', (SELECT json_agg(row_to_json(x)) FROM (SELECT extname,extversion FROM pg_extension ORDER BY extname) x),
 'schemas', (SELECT json_agg(row_to_json(x)) FROM (SELECT nspname,pg_get_userbyid(nspowner) AS owner,nspacl FROM pg_namespace WHERE nspname='public') x),
 'default_acls', (SELECT json_agg(row_to_json(x)) FROM (
  SELECT pg_get_userbyid(defaclrole) AS role,defaclnamespace::regnamespace::text AS schema,defaclobjtype,defaclacl
  FROM pg_default_acl ORDER BY role,schema,defaclobjtype) x),
 'policies', (SELECT json_agg(row_to_json(x)) FROM (SELECT * FROM pg_policies WHERE schemaname='public' ORDER BY tablename,policyname) x)
);
"""

class Lock:
    def __init__(self, path):
        self.path = Path(path)
    def __enter__(self):
        import fcntl
        self.fd = os.open(self.path, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
        try:
            fcntl.flock(self.fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError:
            os.close(self.fd)
            raise Bloqueado("outro deploy detem o lock") from None
        return self
    def __exit__(self, *_):
        os.close(self.fd)

def seguro(path, directory=False):
    path = Path(path)
    exigir(path.is_absolute() and not path.is_symlink(), "caminho administrativo inseguro")
    for p in (path, *path.parents):
        s = p.lstat()
        exigir(not p.is_symlink() and s.st_uid == 0 and not s.st_mode & 0o022, "configuracao ou ancestral nao protegido")
    exigir(path.is_dir() if directory else path.is_file(), "tipo de caminho inesperado")
    return path

def executar(args, cwd=None, timeout=60, env=None):
    environment = {"PATH": "/usr/local/bin:/usr/bin:/bin", "HOME": "/root", "AWS_REGION": "us-east-2", "AWS_SHARED_CREDENTIALS_FILE": "/dev/null", "AWS_CONFIG_FILE": "/dev/null"}
    environment.update(env or {})
    p = subprocess.Popen(args, cwd=cwd, env=environment, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, start_new_session=True)
    try:
        out, _ = p.communicate(timeout=timeout)
    except subprocess.TimeoutExpired:
        os.killpg(p.pid, signal.SIGKILL)
        p.communicate()
        raise Bloqueado("comando excedeu prazo; revisar estado") from None
    exigir(p.returncode == 0, "comando operacional falhou: " + Path(args[0]).name)
    return out.strip()

def atomico(path, data, mode=0o600):
    path = Path(path)
    exigir(not path.is_symlink(), "destino administrativo symlink")
    seguro(path.parent, True)
    tmp = path.parent / (".cd-" + uuid.uuid4().hex)
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, mode)
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(data)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, path)
    finally:
        if tmp.exists():
            tmp.unlink()

def montar_identidade(source, target, user_uid):
    source, target = Path(source), Path(target)
    for p in (source, target):
        exigir(p.is_dir() and p.resolve() == p and not any(x.is_symlink() for x in (p, *p.parents)), "persistencia nao canonica")
    data = json.loads(executar(["findmnt", "--json", "--mountpoint", str(target), "--output", "TARGET,OPTIONS"]))
    mounts = data.get("filesystems", [])
    exigir(len(mounts) == 1 and mounts[0].get("target") == str(target), "mount exato ausente")
    exigir("rw" in mounts[0]["options"].split(",") and "ro" not in mounts[0]["options"].split(","), "mount somente leitura")
    a, b = source.stat(), target.stat()
    exigir((a.st_dev, a.st_ino) == (b.st_dev, b.st_ino) and a.st_uid == user_uid, "origem persistente incorreta")
    exigir(a.st_mode & 0o077 == 0 and a.st_mode & 0o700 == 0o700, "permissoes persistentes incorretas")
    return {"device": a.st_dev, "inode": a.st_ino}

def validar_identidade_ec2(config, identity):
    account, role = "792440910201", "NR33-EC2-SSM-Role"
    exigir(config.get("account_id") == account and config.get("instance_role_name") == role,
           "identidade EC2 aprovada nao declarada")
    exigir(isinstance(identity, dict), "resposta STS invalida")
    arn = identity.get("Arn")
    exigir(identity.get("Account") == account and isinstance(arn, str) and
           re.fullmatch(r"arn:aws:sts::792440910201:assumed-role/NR33-EC2-SSM-Role/i-(?:[0-9a-f]{8}|[0-9a-f]{17})", arn),
           "identidade EC2 aprovada nao comprovada")


class Runtime:
    def __init__(self, config, release, artifact, version, receipt_digest):
        self.config, self.release, self.artifact = config, sha(release), sha(artifact, 64)
        exigir(isinstance(version, str) and re.fullmatch(r"[A-Za-z0-9._~+/-]{1,1024}", version) and version != "null", "versao S3 invalida")
        self.version, self.receipt_digest = version, sha(receipt_digest, 64)
        exigir(config.get("enabled") is True and config.get("region") == "us-east-2", "executor desabilitado")
        exigir(re.fullmatch(r"[a-z_][a-z0-9_-]{0,31}", config.get("application_user", "")), "usuario invalido")
        self.user = pwd.getpwnam(config["application_user"])
        exigir(self.user.pw_uid != 0, "aplicacao nao pode executar como root")
        exigir(re.fullmatch(r"[a-z_][a-z0-9_]{0,62}", config.get("database_role", "")), "role PostgreSQL invalida")
        exigir(config.get("database") == "inventario_nr33_homolog", "banco inesperado")
        exigir(config.get("public_host") in ("inventarionr33.com.br", "www.inventarionr33.com.br"), "host nao autorizado")
        exigir(re.fullmatch(r"[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]", config.get("artifact_bucket", "")), "bucket invalido")
        self.authorize()
        self.previous = self.receipt["previous_sha"]
        self.old_dropin = None
    def authorize(self):
        path = seguro(Path("/etc/nr33/cd-readiness") / (self.release + ".json"))
        exigir(path.stat().st_size < 1024 * 1024, "evidencia muito grande")
        data = path.read_bytes()
        exigir(hashlib.sha256(data).hexdigest() == self.receipt_digest, "evidencia administrativa divergente")
        self.receipt = json.loads(data)
        prontidao(self.receipt, self.release, self.artifact)
    def sql(self, query):
        seguro("/etc/nr33/pg_service.conf")
        return executar(["psql", "-X", "-w", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", query],
            env={"PGSERVICEFILE": "/etc/nr33/pg_service.conf", "PGSERVICE": "nr33_hml_readonly",
                 "PGOPTIONS": "-c default_transaction_read_only=on -c statement_timeout=5000 -c lock_timeout=1000"})
    def schema(self):
        data = json.loads(self.sql(SCHEMA_SQL))
        exigir(data.get("database") == self.config["database"] and data.get("major") == 17, "banco/versao nao comprovados")
        exigir(hashlib.sha256(canonical(data)).hexdigest() == self.receipt["schema_sha256"], "esquema incompativel")
    def units(self):
        out = executar(["systemctl", "show", "nr33-backend.service", "--property", "LoadState,ActiveState,MainPID,Result,User,KillMode,EnvironmentFiles,ControlGroup"])
        return dict(line.split("=", 1) for line in out.splitlines() if "=" in line)
    def mount_release(self, release):
        for name in ("evidencias", "relatorios"):
            montar_identidade(PERSIST / name, BASE / release / "backend/uploads" / name, self.user.pw_uid)
    def preflight(self):
        self.authorize()
        for p in (BASE, "/var/www/nr33", DROPIN.parent, "/run/nr33", LOGS):
            seguro(p, True)
        seguro(ENV_FILE)
        seguro(DROPIN)
        seguro(PERSIST, True)
        exigir(FRONT.is_symlink() and FRONT.resolve() == BASE / self.previous / "frontend", "release anterior nao identificada")
        self.old_dropin = DROPIN.read_bytes()
        exigir(str(BASE / self.previous / "backend").encode() in self.old_dropin, "unit anterior nao corresponde a release")
        unit = self.units()
        exigir(unit.get("LoadState") == "loaded" and unit.get("ActiveState") == "active" and unit.get("User") == self.user.pw_name and unit.get("KillMode") == "control-group" and str(ENV_FILE) in unit.get("EnvironmentFiles", ""), "systemd nao preparado")
        exigir(executar(["node", "--version"]).startswith("v24."), "Node 24 obrigatorio")
        self.mount_release(self.previous)
        self.release_integrity(self.previous)
        identity = json.loads(executar(["aws", "sts", "get-caller-identity", "--output", "json", "--no-cli-pager"]))
        validar_identidade_ec2(self.config, identity)
        self.schema()
    def prepare(self):
        target = BASE / self.release
        exigir(not target.exists(), "release ja existe; nao sobrescrever nem limpar automaticamente")
        with tempfile.TemporaryDirectory(prefix="nr33-cd-artifact-") as temp:
            package = Path(temp) / "release.tar.gz"
            key = "releases/" + self.release + "/" + self.artifact + ".tar.gz"
            out = executar(["aws", "s3api", "get-object", "--region", "us-east-2", "--bucket", self.config["artifact_bucket"], "--key", key,
                            "--version-id", self.version, "--checksum-mode", "ENABLED", str(package), "--output", "json", "--no-cli-pager"])
            exigir(json.loads(out).get("VersionId") == self.version, "versao baixada divergente")
            manifest, files = verificar(package, self.release, self.artifact)
            target.mkdir(mode=0o755)
            for name, data in files.items():
                dest = target / name
                dest.parent.mkdir(parents=True, exist_ok=True)
                dest.write_bytes(data)
            (target / "release-manifest.json").write_bytes(canonical(manifest))
            # npm sem scripts e sem ambiente da aplicacao; nenhuma inicializacao.
            backend = target / "backend"
            os.chown(backend, self.user.pw_uid, self.user.pw_gid)
            lock = (backend / "package-lock.json").read_bytes()
            try:
                with tempfile.TemporaryDirectory(prefix="nr33-cd-npm-") as cache:
                    os.chown(cache, self.user.pw_uid, self.user.pw_gid)
                    executar(["runuser", "-u", self.user.pw_name, "--", "env", "-i", "PATH=/usr/local/bin:/usr/bin:/bin", "HOME=" + cache,
                              "npm", "ci", "--omit=dev", "--ignore-scripts", "--no-audit", "--fund=false", "--cache", cache], cwd=backend, timeout=300)
                exigir((backend / "package-lock.json").read_bytes() == lock, "lockfile alterado")
            finally:
                for root, dirs, names in os.walk(backend, followlinks=False):
                    os.chown(root, 0, 0)
                    os.chmod(root, os.stat(root).st_mode & ~0o022)
                    for name in dirs + names:
                        q = Path(root) / name
                        exigir(not q.is_symlink() or q.resolve().is_relative_to(target), "link de dependencia externo")
                        os.chown(q, 0, 0, follow_symlinks=False)
                        if not q.is_symlink():
                            os.chmod(q, os.stat(q).st_mode & ~0o022)
                os.chown(backend, 0, self.user.pw_gid)
                os.chmod(backend, 0o750)
        upload = target / "backend/uploads"
        upload.mkdir(mode=0o555)
        for name in ("evidencias", "relatorios"):
            dest = upload / name
            dest.mkdir(mode=0o555)
            executar(["mount", "--bind", str(PERSIST / name), str(dest)])
            executar(["mount", "-o", "remount,bind,rw,nosuid,nodev,noexec", str(dest)])
        self.mount_release(self.release)
    def code(self, path):
        return executar(["curl", "--silent", "--show-error", "--connect-timeout", "5", "--max-time", "15",
                         "--resolve", self.config["public_host"] + ":443:127.0.0.1", "--output", "/dev/null", "--write-out", "%{http_code}",
                         "https://" + self.config["public_host"] + path])
    def maintenance(self, enabled):
        if enabled:
            atomico(MAINTENANCE, b"maintenance\n", 0o644)
            exigir(self.code("/api/health") == "503", "manutencao Nginx nao comprovada")
        else:
            exigir(MAINTENANCE.exists() and not MAINTENANCE.is_symlink(), "estado de manutencao inesperado")
            MAINTENANCE.unlink()
    def stop(self):
        executar(["systemctl", "stop", "nr33-backend.service"], timeout=110)
        unit = self.units()
        exigir(unit.get("ActiveState") == "inactive" and unit.get("MainPID") == "0" and unit.get("Result") == "success", "parada incompleta ou forcada")
        group = unit.get("ControlGroup", "")
        if group:
            exigir(group.startswith("/") and ".." not in Path(group).parts, "cgroup invalido")
            procs = Path("/sys/fs/cgroup") / group.lstrip("/") / "cgroup.procs"
            exigir(not procs.exists() or not procs.read_text().strip(), "processos remanescentes")
        role = self.config["database_role"]  # Validado por allowlist no construtor.
        count = self.sql("SELECT count(*) FROM pg_stat_activity WHERE backend_type='client backend' AND pid<>pg_backend_pid() AND usename='" + role + "';")
        exigir(count == "0", "outro escritor/conexao da aplicacao permanece")
    def activate(self, release):
        sha(release)
        self.mount_release(release)
        data = ("[Service]\nWorkingDirectory=" + str(BASE / release / "backend") +
                "\nExecStart=\nExecStart=/usr/bin/node " + str(BASE / release / "backend/src/server.js") +
                "\nEnvironmentFile=" + str(ENV_FILE) + "\n").encode()
        atomico(DROPIN, data)
        self.front(release)
        executar(["systemctl", "daemon-reload"])
    def front(self, release):
        target = BASE / release / "frontend"
        exigir(target.is_dir() and target.resolve() == target, "frontend nao canonico")
        temp = FRONT.parent / (".cd-" + uuid.uuid4().hex)
        temp.symlink_to(target)
        os.replace(temp, FRONT)
    def restore(self):
        self.mount_release(self.previous)
        atomico(DROPIN, self.old_dropin)
        self.front(self.previous)
        executar(["systemctl", "daemon-reload"])
    def start(self):
        executar(["systemctl", "start", "nr33-backend.service"], timeout=60)
    def release_integrity(self, release):
        manifest = json.loads(seguro(BASE / release / "release-manifest.json").read_text())
        exigir(manifest.get("sha") == release and manifest.get("protocol") == 1, "manifesto instalado divergente")
        exigir_arquivos_obrigatorios(manifest.get("files", {}))
        for name, expected in manifest.get("files", {}).items():
            path = seguro(BASE / release / nome(name))
            exigir(path.stat().st_nlink == 1 and path.stat().st_size == expected["size"] and hashlib.sha256(path.read_bytes()).hexdigest() == expected["sha256"], "release instalada alterada")
        exigir(bool(manifest.get("files")), "manifesto instalado vazio")
    def health(self, release):
        import time
        deadline = time.monotonic() + 60
        while True:
            try:
                return self._health_once(release)
            except (Bloqueado, ValueError):
                if time.monotonic() >= deadline:
                    raise Bloqueado("saude nao comprovada no prazo") from None
                time.sleep(2)
    def _health_once(self, release):
        self.release_integrity(release)
        self.mount_release(release)
        unit = self.units()
        exigir(unit.get("ActiveState") == "active" and unit.get("MainPID") != "0", "backend inativo")
        executar(["systemctl", "is-active", "--quiet", "nginx.service"])
        exigir(executar(["curl", "--silent", "--show-error", "--max-time", "5", "--output", "/dev/null", "--write-out", "%{http_code}", "http://127.0.0.1:3000/api/health"]) == "200", "HTTP backend indisponivel")
        marker = executar(["curl", "--silent", "--show-error", "--fail", "--max-time", "15", "--resolve",
            self.config["public_host"] + ":443:127.0.0.1", "https://" + self.config["public_host"] + "/release.json"])
        exigir(json.loads(marker) == {"sha": release}, "Nginx serve outra release")
        self.schema()  # O HTTP existente nao valida PostgreSQL.
    def public_health(self, release):
        exigir(self.code("/api/health") == "200", "proxy Nginx indisponivel")
        self.health(release)
    def record(self, status):
        data = {"status": status, "sha": self.release, "previous_sha": self.previous, "artifact_sha256": self.artifact, "utc": dt.datetime.now(dt.timezone.utc).isoformat()}
        atomico(LOGS / (uuid.uuid4().hex + ".json"), canonical(data))
        print(json.dumps(data), flush=True)

def transacao(ops):
    """Maquina de estados testada com mocks. Sem migrations, limpeza de releases ou restore de dados."""
    ops.preflight()
    ops.prepare()
    ops.authorize()
    maintenance = False
    switched = False
    try:
        maintenance = True
        ops.maintenance(True)
        ops.stop()
        switched = True  # activate pode falhar parcialmente.
        ops.activate(ops.release)
        ops.start()
        ops.health(ops.release)
        ops.maintenance(False)
        ops.public_health(ops.release)
        ops.record("SUCCESS")
    except Exception:
        if maintenance:
            try:
                ops.maintenance(True)
                ops.stop()
                if switched:
                    ops.restore()
                ops.start()
                ops.health(ops.previous)
                ops.maintenance(False)
                ops.public_health(ops.previous)
                ops.record("ROLLED_BACK")
            except Exception:
                # Manter manutencao sempre que possivel; nunca anunciar sucesso.
                try:
                    ops.maintenance(True)
                except Exception:
                    pass
                ops.record("MANUAL_RECOVERY_REQUIRED")
                raise Bloqueado("rollback incompleto; recuperacao manual obrigatoria") from None
        raise Bloqueado("implantacao recusada; aplicacao anterior preservada/revertida") from None

def main():
    exigir(hasattr(os, "geteuid") and os.geteuid() == 0, "executor exige administrador Linux")
    config = json.loads(seguro("/etc/nr33/cd.json").read_text())
    release, artifact = sha(os.environ.get("SSM_ReleaseSha")), sha(os.environ.get("SSM_ArtifactSha256"), 64)
    lockdir = seguro("/run/nr33-cd", True)
    with Lock(lockdir / "deploy.lock"):
        ops = Runtime(config, release, artifact, os.environ.get("SSM_ArtifactVersion"), os.environ.get("SSM_ReadinessSha256"))
        transacao(ops)

if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(json.dumps({"event": "CD_BLOCKED", "reason": str(error) if isinstance(error, Bloqueado) else type(error).__name__}), flush=True)
        raise SystemExit(1)
