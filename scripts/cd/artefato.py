"""Empacotamento allowlist e verificacao sem extracao; nenhum script do pacote e executado."""
import argparse
import gzip
import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import re
import subprocess
import tarfile
from contrato import exigir, sha, canonical, pacote_runner

MAX_BYTES = 256 * 1024 * 1024
def digest(data):
    return hashlib.sha256(data).hexdigest()

def nome(name):
    p = PurePosixPath(name)
    exigir(isinstance(name, str) and name and "\\" not in name and not p.is_absolute() and ".." not in p.parts and str(p) == name, "caminho inseguro")
    exigir(all(not x.startswith(".") and not re.search(r"(?i)(^|[._-])(env|credentials?|secrets?|uploads?|dumps?|logs?|node_modules|tmp)([._-]|$)", x) for x in p.parts), "arquivo proibido")
    allowed = name in ("backend/package.json", "backend/package-lock.json") or (
        name.startswith("backend/src/") and p.suffix in (".js", ".cjs", ".mjs", ".json")
    ) or (name.startswith("shared/") and p.suffix in (".json", ".mjs")) or (
        name.startswith("frontend/") and p.suffix in (".html", ".js", ".css", ".json", ".svg", ".png", ".ico", ".webmanifest", ".woff", ".woff2", ".txt")
    )
    exigir(allowed, "fora da allowlist")
    return name

def conteudo(data):
    exigir(not re.search(rb"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|(?:AKIA|ASIA)[A-Z0-9]{16}", data), "assinatura sensivel")

def verificar(path, expected_sha, expected_digest=None):
    if expected_digest:
        exigir(digest(Path(path).read_bytes()) == sha(expected_digest, 64), "hash do pacote divergente")
    files = {}
    total = 0
    with tarfile.open(path, "r:gz") as archive:
        for entry in archive:
            exigir(entry.isfile() and entry.name not in files and not entry.pax_headers, "link, duplicata ou metadado inesperado")
            exigir(entry.size <= MAX_BYTES, "entrada muito grande")
            total += entry.size
            exigir(total <= MAX_BYTES, "pacote muito grande")
            data = archive.extractfile(entry).read()
            exigir(len(data) == entry.size, "entrada truncada")
            if entry.name != "manifest.json":
                nome(entry.name)
                conteudo(data)
            files[entry.name] = data
    exigir("manifest.json" in files, "manifesto ausente")
    manifest = json.loads(files.pop("manifest.json"))
    exigir(manifest.get("protocol") == 1 and manifest.get("sha") == sha(expected_sha), "SHA/protocolo divergente")
    exigir(manifest.get("approval") == "NOT_VERIFIED" and manifest.get("deployEligible") is False, "artefato nao concede aprovacao")
    inventory = manifest.get("files", {})
    exigir(set(inventory) == set(files), "inventario divergente")
    for name, data in files.items():
        exigir(inventory[name] == {"sha256": digest(data), "size": len(data)}, "integridade de arquivo divergente")
    for required in ("backend/package.json", "backend/package-lock.json", "backend/src/server.js", "shared/permissoes.json", "shared/espacoConfinado.mjs", "frontend/index.html", "frontend/release.json"):
        exigir(required in files, "recurso obrigatorio ausente")
    exigir(json.loads(files["frontend/release.json"]) == {"sha": expected_sha}, "frontend de outro SHA")
    return manifest, files

def criar(root, release, dist, output):
    release = sha(release)
    root, dist, output = Path(root).resolve(), Path(dist).resolve(), Path(output)
    exigir(not output.exists(), "saida ja existe")
    exigir(subprocess.check_output(["git", "-C", str(root), "rev-parse", "HEAD"], text=True).strip() == sha(release), "checkout de outro SHA")
    tree = subprocess.check_output(["git", "-C", str(root), "ls-tree", "-rz", release])
    entries = {}
    for item in tree.split(b"\0"):
        if not item:
            continue
        meta, rawname = item.split(b"\t", 1)
        mode, kind, blob = meta.decode().split()
        name = rawname.decode()
        if name in ("backend/package.json", "backend/package-lock.json") or name.startswith(("backend/src/", "shared/")):
            exigir(mode in ("100644", "100755") and kind == "blob", "symlink na fonte")
            nome(name)
            data = subprocess.check_output(["git", "-C", str(root), "cat-file", "blob", blob])
            conteudo(data)
            entries[name] = data
    exigir(dist.is_dir() and not dist.is_symlink(), "dist invalido")
    for p in dist.rglob("*"):
        exigir(not p.is_symlink(), "symlink no dist")
        if p.is_file():
            exigir(p.stat().st_nlink == 1, "hardlink no dist")
            name = nome("frontend/" + p.relative_to(dist).as_posix())
            exigir(name != "frontend/release.json", "marcador reservado")
            data = p.read_bytes()
            conteudo(data)
            entries[name] = data
    entries["frontend/release.json"] = canonical({"sha": release})
    manifest = {"protocol": 1, "sha": release, "tree": subprocess.check_output(["git", "-C", str(root), "rev-parse", release + "^{tree}"], text=True).strip(),
                "approval": "NOT_VERIFIED", "deployEligible": False,
                "node": subprocess.check_output(["node", "--version"], text=True).strip(),
                "npm": subprocess.check_output(["npm", "--version"], text=True).strip(),
                "files": {n: {"sha256": digest(b), "size": len(b)} for n, b in sorted(entries.items())}}
    entries["manifest.json"] = canonical(manifest)
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("xb") as raw:
        with gzip.GzipFile(fileobj=raw, mode="wb", mtime=0, filename="") as compressed:
            with tarfile.open(fileobj=compressed, mode="w", format=tarfile.USTAR_FORMAT) as archive:
                for name, data in sorted(entries.items()):
                    header = tarfile.TarInfo(name)
                    header.size, header.mode, header.mtime = len(data), 0o644, 0
                    archive.addfile(header, io.BytesIO(data))
    verificar(output, release)
    result = {"sha": release, "sha256": digest(output.read_bytes()), "size": output.stat().st_size}
    with output.with_suffix(".json").open("xb") as receipt:
        receipt.write(canonical(result))
    if os.environ.get("GITHUB_OUTPUT"):
        with open(os.environ["GITHUB_OUTPUT"], "a", encoding="utf-8") as f:
            f.write("sha=" + release + "\nsha256=" + result["sha256"] + "\n")
    return result

if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("command", choices=["criar", "verificar"])
    package = pacote_runner()
    p.add_argument("--sha", required=True, type=sha)
    p.add_argument("--package", required=True, choices=[str(package)])
    p.add_argument("--root", default=".", choices=["."])
    p.add_argument("--dist", default="frontend/dist", choices=["frontend/dist"])
    args = p.parse_args()
    if args.command == "criar":
        print(json.dumps(criar(Path.cwd(), args.sha, Path.cwd() / "frontend/dist", package)))
    else:
        verificar(package, args.sha)
        print("integridade aprovada; implantacao nao autorizada pelo artefato")
