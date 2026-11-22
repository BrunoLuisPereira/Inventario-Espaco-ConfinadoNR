# Correcao SonarCloud do PR #72

Analise do HEAD `5a43810d41b834b15421cce65f3613665c9834f3`:
`new_security_rating=5` (E), limite `1` (A). Demais condicoes passaram:
confiabilidade A, manutencao A, duplicacao nova 0,0% (maximo 3%) e hotspots
revisados 100%. Cobertura nao consta como condicao dessa falha.

A API publica `qualitygates/project_status` e o check GitHub confirmaram a causa.
14 vulnerabilidades novas estavam em `stage.py` e `fixtures.py`: S5443
(diretorio publico), S6350 (argumentos), S2083/S8707 (caminhos) e S6549
(filesystem oracle). Nenhuma exclusao de analise, supressao ou criterio foi alterado.

Correcao: fixtures com destino fixo e argumentos de destino recusados; nomes de
pacotes fixos; validacao direta de SHA e caminhos antes de usar filesystem/Git;
arvore Git validada antes de ler blobs; staging/npm sob diretorio protegido;
ownership aplicado com `os.chown`, sem comandos construidos com nomes de entrada.

Validacao: build Docker do staging corrigido e cinco testes novos aprovados,
incluindo tentativa de traversal, argumento Git malicioso e sobrescrita de fixtures.
Nenhum PostgreSQL, servico, AWS ou EC2 foi iniciado/modificado nesta correcao.
As evidencias operacionais anteriores continuam historicas, nao foram promovidas
nem atribuidas aos scripts corrigidos.
