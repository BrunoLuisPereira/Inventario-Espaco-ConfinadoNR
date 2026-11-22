"""Promote an existing verified package; never rebuild or grant operational approval."""
import argparse
import json
import os
from pathlib import Path
import re
import urllib.request
from contrato import exigir, sha, REPOSITORY, pacote_runner
from artefato import verificar


def confirmar_codigo(get, release, head):
    sha(release); sha(head)
    comparison = get('compare/' + release + '...' + head)
    exigir(comparison.get('status') in ('ahead', 'identical') and
           comparison.get('merge_base_commit', {}).get('sha') == release,
           'release nao pertence ao historico da main')
    trees = []
    for commit in (release, head):
        obj = get('git/commits/' + commit)
        exigir(obj.get('sha') == commit, 'commit de outra origem')
        tree = get('git/trees/' + sha(obj['tree']['sha']))
        exigir(tree.get('truncated') is False, 'arvore incompleta')
        relevant = {x['path']: (x['mode'], x['type'], x['sha']) for x in tree['tree']
                    if x['path'] in ('backend', 'frontend', 'shared')}
        exigir(set(relevant) == {'backend', 'frontend', 'shared'} and
               all(x[0:2] == ('040000', 'tree') for x in relevant.values()),
               'arvores da aplicacao ausentes ou invalidas')
        trees.append(relevant)
    exigir(trees[0] == trees[1], 'codigo da aplicacao mudou apos o ensaio')


def selecionar(get, release, run_id, artifact_id, expected_digest):
    sha(release); sha(expected_digest, 64)
    for value in (run_id, artifact_id):
        exigir(isinstance(value, str) and re.fullmatch(r'[1-9][0-9]{0,19}', value), 'ID de origem invalido')
    workflow = get('actions/workflows/cd-homologacao.yml')
    run = get('actions/runs/' + run_id)
    exigir(run.get('id') == int(run_id) and run.get('workflow_id') == workflow.get('id') and
           workflow.get('path') == '.github/workflows/cd-homologacao.yml' and
           run.get('path') == workflow['path'] and run.get('head_sha') == release and
           run.get('head_branch') == 'main' and run.get('event') == 'workflow_dispatch' and
           run.get('head_repository', {}).get('full_name') == REPOSITORY and
           run.get('status') == 'completed' and run.get('conclusion') == 'success',
           'origem do build nao comprovada')
    attempt = run.get('run_attempt')
    exigir(type(attempt) is int and attempt > 0, 'tentativa do build invalida')
    page = get('actions/runs/' + run_id + '/artifacts?per_page=100')
    artifacts = page.get('artifacts', [])
    exigir(page.get('total_count') == len(artifacts) and len(artifacts) <= 100, 'listagem de artefatos incompleta')
    matches = [a for a in artifacts if a.get('id') == int(artifact_id)]
    exigir(len(matches) == 1 and matches[0].get('expired') is False and
           matches[0].get('name') == 'nr33-' + run_id + '-' + str(attempt) and
           matches[0].get('workflow_run', {}).get('id') == int(run_id) and
           matches[0]['workflow_run'].get('head_sha') == release,
           'artefato expirado ou de outra execucao')
    return {'artifact_id': artifact_id, 'run_id': run_id, 'sha256': expected_digest}


def cliente():
    token = os.environ.get('GH_READ_TOKEN', '')
    exigir(token and os.environ.get('GITHUB_REPOSITORY') == REPOSITORY, 'contexto GitHub invalido')
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, *args): return None
    opener = urllib.request.build_opener(NoRedirect())
    def get(endpoint):
        req = urllib.request.Request('https://api.github.com/repos/' + REPOSITORY + '/' + endpoint,
            headers={'Authorization': 'Bearer ' + token, 'Accept': 'application/vnd.github+json',
                     'X-GitHub-Api-Version': '2022-11-28'})
        with opener.open(req, timeout=20) as response:
            exigir(response.status == 200, 'consulta GitHub recusada')
            raw = response.read(4 * 1024 * 1024 + 1)
        exigir(len(raw) <= 4 * 1024 * 1024, 'resposta GitHub excessiva')
        return json.loads(raw)
    return get


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('command', choices=['selecionar', 'verificar'])
    args = parser.parse_args()
    release = sha(os.environ.get('RELEASE_SHA'))
    digest = sha(os.environ.get('ARTIFACT_SHA256'), 64)
    if args.command == 'selecionar':
        result = selecionar(cliente(), release, os.environ.get('CANDIDATE_RUN_ID'),
                            os.environ.get('CANDIDATE_ARTIFACT_ID'), digest)
        with Path(os.environ['GITHUB_OUTPUT']).open('a', encoding='utf-8') as out:
            for key, value in result.items(): out.write(key + '=' + value + '\n')
    else:
        package = pacote_runner(candidate=True)
        exigir(set(package.parent.iterdir()) == {package}, 'arquivo adicional no artefato')
        verificar(package, release, digest)
        print('Pacote original confere com SHA e SHA-256 aprovados; nenhuma reconstrucao.')
