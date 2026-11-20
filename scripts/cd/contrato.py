"""Contratos puros. Evidencias administrativas nao substituem ensaios reais."""
import datetime as dt
import re

REPOSITORY = "BrunoLuisPereira/Inventario-Espaco-ConfinadoNR"

class Bloqueado(RuntimeError):
    pass

def exigir(condition, reason):
    if not condition:
        raise Bloqueado(reason)

def sha(value, length=40):
    if not isinstance(value, str) or re.fullmatch("[0-9a-f]{" + str(length) + "}", value) is None:
        raise Bloqueado("hash invalido")
    return value

def canonical(value):
    import json
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode()

def instante(value):
    exigir(isinstance(value, str), "horario ausente")
    try:
        result = dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        raise Bloqueado("horario invalido") from None
    exigir(result.tzinfo is not None, "horario sem timezone")
    return result

def prontidao(record, release, artifact, now=None):
    now = now or dt.datetime.now(dt.timezone.utc)
    exigir(type(record) is dict and record.get("protocol") == 1, "protocolo de prontidao")
    exigir(record.get("release_sha") == sha(release), "prontidao de outro SHA")
    exigir(record.get("artifact_sha256") == sha(artifact, 64), "prontidao de outro artefato")
    for field in ("approved", "maintenance_authorized", "writers_inventory_complete", "rollback_tested"):
        exigir(record.get(field) is True, "evidencia pendente: " + field)
    until = instante(record.get("valid_until"))
    exigir(now < until <= now + dt.timedelta(hours=4), "autorizacao expirada ou janela excessiva")
    backup = record.get("backup", {})
    exigir(backup.get("restore_tested") is True and bool(backup.get("set_id")), "backup/restauracao nao comprovados")
    sha(backup.get("manifest_sha256"), 64)
    exigir(instante(backup.get("verified_at")) <= now, "verificacao de backup futura")
    age = now - instante(backup.get("captured_at"))
    exigir(dt.timedelta(0) <= age <= dt.timedelta(hours=24), "backup fora do RPO proposto")
    previous = sha(record.get("previous_sha"))
    exigir(previous != release and set(record.get("schema_compatible_shas", [])) == {release, previous}, "esquema nao aprovado para deploy e rollback")
    sha(record.get("schema_sha256"), 64)
    return previous

def ambiente_github(environment, branches):
    exigir(environment.get("name") == "homologacao", "environment inesperado")
    rules = environment.get("protection_rules", [])
    exigir(any(r.get("type") == "required_reviewers" and r.get("reviewers") for r in rules), "aprovacao manual obrigatoria")
    policy = environment.get("deployment_branch_policy") or {}
    exigir(policy.get("custom_branch_policies") is True, "restringir environment a main")
    exigir(branches.get("total_count") == 1 and len(branches.get("branch_policies", [])) == 1, "politica de branches incompleta")
    branch = branches["branch_policies"][0]
    exigir(branch.get("name") == "main" and branch.get("type") == "branch", "somente main pode implantar")


def pacote_runner(candidate=False):
    """CLI aceita somente o arquivo previsto no espaco temporario do runner."""
    import os
    from pathlib import Path
    base = Path(os.environ.get("RUNNER_TEMP", ""))
    if not base.is_absolute() or not base.is_dir() or base.resolve() != base:
        raise Bloqueado("RUNNER_TEMP canonico obrigatorio")
    package = base / "candidate" / "release.tar.gz" if candidate else base / "release.tar.gz"
    for path in (package, *package.parents):
        if path.is_symlink():
            raise Bloqueado("symlink no caminho do pacote")
    if package.exists() and (not package.is_file() or package.stat().st_nlink != 1):
        raise Bloqueado("pacote nao e arquivo regular exclusivo")
    return package
