"""Controle GitHub/AWS. CLI executa somente em modo explicito; testes injetam AWS fake."""
import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import time
import urllib.request
from contrato import exigir, sha, ambiente_github, canonical, REPOSITORY, Bloqueado, pacote_runner
from artefato import verificar

class Ausente(Bloqueado):
    pass

class AWS:
    def call(self, *args):
        r = subprocess.run(["aws", *args, "--region", "us-east-2", "--output", "json", "--no-cli-pager"], capture_output=True, text=True, timeout=90)
        if r.returncode:
            if any(x in r.stderr for x in ("(404)", "(NoSuchKey)", "(NotFound)", "(InvocationDoesNotExist)")):
                raise Ausente("recurso ainda ausente")
            raise Bloqueado("consulta AWS recusada")
        return json.loads(r.stdout)

def ambiente():
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, *args, **kwargs):
            return None
    token = os.environ.get("GH_READ_TOKEN", "")
    exigir(token and os.environ.get("GITHUB_REPOSITORY") == REPOSITORY, "contexto GitHub invalido")
    opener = urllib.request.build_opener(NoRedirect())
    def get(suffix):
        req = urllib.request.Request("https://api.github.com/repos/" + REPOSITORY + "/environments/homologacao" + suffix,
            headers={"Authorization": "Bearer " + token, "Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28"})
        with opener.open(req, timeout=15) as r:
            exigir(r.status == 200, "environment nao comprovado")
            data = r.read(1024 * 1024 + 1)
        exigir(len(data) <= 1024 * 1024, "resposta excessiva")
        return json.loads(data)
    ambiente_github(get(""), get("/deployment-branch-policies"))

def configurar(env, exigir_prontidao=True):
    exigir(env.get("CD_ENABLED") == "true", "CD desabilitado")
    config = {k: env.get(k, "") for k in ("CD_ACCOUNT_ID", "CD_ROLE_ARN", "CD_ARTIFACT_BUCKET", "CD_INSTANCE_ID", "CD_SSM_DOCUMENT", "CD_SSM_VERSION", "CD_READINESS_SHA256")}
    exigir(re.fullmatch(r"[0-9]{12}", config["CD_ACCOUNT_ID"]), "conta invalida")
    exigir(re.fullmatch(r"arn:aws:iam::" + config["CD_ACCOUNT_ID"] + r":role/[A-Za-z0-9_+=,.@/-]+", config["CD_ROLE_ARN"]), "role invalida")
    exigir(re.fullmatch(r"[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]", config["CD_ARTIFACT_BUCKET"]), "bucket invalido")
    exigir(re.fullmatch(r"i-[0-9a-f]{8,17}", config["CD_INSTANCE_ID"]), "instancia invalida")
    exigir(re.fullmatch(r"nr33-hml-cd-[A-Za-z0-9_-]+", config["CD_SSM_DOCUMENT"]), "documento dedicado obrigatorio")
    exigir(re.fullmatch(r"[1-9][0-9]*", config["CD_SSM_VERSION"]), "versao SSM fixa obrigatoria")
    if exigir_prontidao:
        sha(config["CD_READINESS_SHA256"], 64)
    return config

def implantar(aws, config, package, release, artifact_hash, document, sleep=time.sleep, clock=time.monotonic):
    verificar(package, release, artifact_hash)
    identity = aws.call("sts", "get-caller-identity")
    expected = "arn:aws:sts::" + config["CD_ACCOUNT_ID"] + ":assumed-role/" + config["CD_ROLE_ARN"].split("/")[-1] + "/"
    exigir(identity.get("Account") == config["CD_ACCOUNT_ID"] and identity.get("Arn", "").startswith(expected), "identidade temporaria incorreta")
    bucket = config["CD_ARTIFACT_BUCKET"]
    public = aws.call("s3api", "get-public-access-block", "--bucket", bucket).get("PublicAccessBlockConfiguration", {})
    exigir(all(public.get(x) is True for x in ("BlockPublicAcls", "IgnorePublicAcls", "BlockPublicPolicy", "RestrictPublicBuckets")), "bucket nao privado")
    exigir(aws.call("s3api", "get-bucket-versioning", "--bucket", bucket).get("Status") == "Enabled", "versionamento ausente")
    ownership = aws.call("s3api", "get-bucket-ownership-controls", "--bucket", bucket)
    exigir(ownership.get("OwnershipControls", {}).get("Rules") == [{"ObjectOwnership": "BucketOwnerEnforced"}], "ACLs nao desabilitadas")
    encryption = aws.call("s3api", "get-bucket-encryption", "--bucket", bucket)
    exigir(any(r.get("ApplyServerSideEncryptionByDefault", {}).get("SSEAlgorithm") == "AES256" for r in encryption.get("ServerSideEncryptionConfiguration", {}).get("Rules", [])), "SSE-S3 obrigatorio")
    nodes = aws.call("ssm", "describe-instance-information", "--filters", "Key=InstanceIds,Values=" + config["CD_INSTANCE_ID"]).get("InstanceInformationList", [])
    exigir(len(nodes) == 1 and nodes[0].get("InstanceId") == config["CD_INSTANCE_ID"] and nodes[0].get("PingStatus") == "Online" and nodes[0].get("PlatformType") == "Linux", "managed node nao comprovado")
    doc = aws.call("ssm", "get-document", "--name", config["CD_SSM_DOCUMENT"], "--document-version", config["CD_SSM_VERSION"], "--document-format", "JSON")
    exigir(doc.get("DocumentVersion") == config["CD_SSM_VERSION"] and json.loads(doc.get("Content", "null")) == document, "documento SSM diverge do executor revisado")
    key = "releases/" + release + "/" + artifact_hash + ".tar.gz"
    checksum = base64.b64encode(bytes.fromhex(artifact_hash)).decode()
    try:
        stored = aws.call("s3api", "head-object", "--bucket", bucket, "--key", key, "--checksum-mode", "ENABLED")
        exigir(stored.get("ChecksumSHA256") == checksum and stored.get("ContentLength") == Path(package).stat().st_size, "objeto existente divergente")
    except Ausente:
        stored = aws.call("s3api", "put-object", "--bucket", bucket, "--key", key, "--body", str(package), "--server-side-encryption", "AES256",
                         "--if-none-match", "*", "--checksum-algorithm", "SHA256", "--checksum-sha256", checksum)
    version = stored.get("VersionId")
    exigir(isinstance(version, str) and version != "null" and re.fullmatch(r"[A-Za-z0-9._~+/-]{1,1024}", version), "versao de objeto ausente")
    parameters = {"ReleaseSha": [release], "ArtifactSha256": [artifact_hash], "ArtifactVersion": [version], "ReadinessSha256": [config["CD_READINESS_SHA256"]]}
    command = aws.call("ssm", "send-command", "--document-name", config["CD_SSM_DOCUMENT"], "--document-version", config["CD_SSM_VERSION"],
                       "--instance-ids", config["CD_INSTANCE_ID"], "--parameters", json.dumps(parameters), "--timeout-seconds", "1200", "--max-concurrency", "1", "--max-errors", "0")
    cid = command.get("Command", {}).get("CommandId", "")
    exigir(re.fullmatch(r"[a-f0-9-]{36}", cid), "identidade de comando invalida")
    deadline = clock() + 1250
    while clock() < deadline:
        try:
            result = aws.call("ssm", "get-command-invocation", "--command-id", cid, "--instance-id", config["CD_INSTANCE_ID"])
        except Ausente:
            sleep(5)
            continue
        status = result.get("Status")
        if status == "Success":
            exigir(result.get("ResponseCode") == 0, "executor nao confirmou sucesso")
            return {"command_id": cid, "sha": release, "artifact_sha256": artifact_hash, "version": version}
        exigir(status in ("Pending", "InProgress", "Delayed"), "deploy recusado ou revertido; verificar evidencias SSM")
        sleep(5)
    raise Bloqueado("estado remoto incerto; nao reenviar comando nem presumir cancelamento")

if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("command", choices=["ambiente", "implantar"])
    p.add_argument("--package")
    p.add_argument("--sha")
    p.add_argument("--digest")
    p.add_argument("--document", default="infra/cd/ssm-document.json", choices=["infra/cd/ssm-document.json"])
    a = p.parse_args()
    try:
        if a.command == "ambiente":
            ambiente()
            configurar(os.environ, exigir_prontidao=False)
            print("Environment, aprovacao manual e configuracao declarada comprovados; nenhum deploy")
        else:
            package = pacote_runner(candidate=True)
            if a.package != str(package):
                raise Bloqueado("CLI aceita somente o pacote candidato do runner")
            document = Path(__file__).resolve().parents[2] / "infra/cd/ssm-document.json"
            result = implantar(AWS(), configurar(os.environ), package, sha(a.sha.lower()), sha(a.digest, 64), json.loads(document.read_text()))
            print(json.dumps(result))
    except Exception as error:
        print("CD bloqueado: " + (str(error) if isinstance(error, Bloqueado) else type(error).__name__))
        raise SystemExit(1)
