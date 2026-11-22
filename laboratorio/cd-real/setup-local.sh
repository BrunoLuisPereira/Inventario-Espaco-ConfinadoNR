#!/bin/bash
set -euo pipefail
[[ -f /.dockerenv && ! -e /etc/nr33/cd.json ]]
[[ "$(cat /proc/1/comm)" == systemd ]]
[[ "$(ls /sys/class/net)" == lo ]]
/opt/nr33-lab/setup-services.sh
export PYTHONPATH=/usr/local/lib/nr33-cd
python3 - <<'PY'
from adaptador import guard, local_env
from pathlib import Path
guard()
Path('/etc/nr33/backend.env').write_text(local_env())
Path('/etc/nr33/pg_service.conf').write_text('[nr33_hml_readonly]\nhost=/var/run/postgresql\nport=5432\ndbname=inventario_nr33_homolog\nuser=nr33inspect\n')
Path('/etc/nr33/pg_service.conf').chmod(0o600)
PY
# Somente a modalidade fixtures cria um cluster/dataset artificial.
# Releases de repositorio exigem preparacao separada autorizada, nunca restore aqui.
if [[ "${1:-}" == --fixtures ]]; then
  python3 - <<'PY'
from adaptador import load_spec, INPUT
from contrato import exigir
exigir(load_spec(INPUT/'input.json')['source_kind'] == 'fixtures', 'fixture nao pode certificar release real')
PY
  [[ ! -e /opt/nr33-lab/pgdata ]]
  install -d -o postgres -g postgres -m 0700 /opt/nr33-lab/pgdata
  /usr/sbin/runuser -u postgres -- /usr/lib/postgresql/17/bin/initdb -D /opt/nr33-lab/pgdata --auth-local=peer --auth-host=reject
  printf "listen_addresses = ''\nunix_socket_directories = '/var/run/postgresql'\n" >> /opt/nr33-lab/pgdata/postgresql.conf
  { printf 'local inventario_nr33_homolog nr33inspect trust\n'; cat /opt/nr33-lab/pgdata/pg_hba.conf; } > /opt/nr33-lab/pgdata/hba.tmp
  mv /opt/nr33-lab/pgdata/hba.tmp /opt/nr33-lab/pgdata/pg_hba.conf
  chown postgres:postgres /opt/nr33-lab/pgdata/pg_hba.conf
else
  [[ "${1:-}" == --prepared && -f /opt/nr33-lab/pgdata/PG_VERSION && -f /etc/nr33/lab-schema.sha256 ]]
  # A configuracao preparada deve permanecer exclusivamente socket local.
  [[ "$(/usr/sbin/runuser -u postgres -- /usr/lib/postgresql/17/bin/postgres -D /opt/nr33-lab/pgdata -C listen_addresses)" == '' ]]
fi
install -d -o postgres -g postgres -m 0755 /var/run/postgresql
cat > /etc/systemd/system/nr33-lab-postgres.service <<'EOF'
[Unit]
Description=Disposable PostgreSQL 17 lab only
[Service]
User=postgres
Group=postgres
ExecStart=/usr/lib/postgresql/17/bin/postgres -D /opt/nr33-lab/pgdata
KillSignal=SIGINT
TimeoutStopSec=60
EOF
systemctl daemon-reload
systemctl start nr33-lab-postgres
for attempt in {1..30}; do /usr/lib/postgresql/17/bin/pg_isready -h /var/run/postgresql && break; sleep 1; done
if [[ "${1:-}" == --fixtures ]]; then
  /usr/sbin/runuser -u postgres -- psql -X -v ON_ERROR_STOP=1 <<'SQL'
CREATE ROLE nr33lab LOGIN;
CREATE ROLE nr33inspect LOGIN;
GRANT pg_read_all_data, pg_read_all_stats TO nr33inspect;
ALTER ROLE nr33inspect SET default_transaction_read_only=on;
CREATE DATABASE inventario_nr33_homolog OWNER nr33lab;
SQL
  /usr/sbin/runuser -u nr33lab -- psql -X -v ON_ERROR_STOP=1 -d inventario_nr33_homolog <<'SQL'
CREATE TABLE lab_sentinel(id integer PRIMARY KEY, payload text NOT NULL);
INSERT INTO lab_sentinel VALUES(1, 'LOCAL-FIXTURE-ONLY');
SQL
  python3 - <<'PY'
from adaptador import RealRuntime, load_spec, INPUT, digest
from contrato import canonical
from servidor import SCHEMA_SQL, atomico
import json
ops=RealRuntime(load_spec(INPUT/'input.json'), '0'*64)
catalog=json.loads(ops.sql(SCHEMA_SQL))
atomico('/etc/nr33/lab-schema.sha256', digest(canonical(catalog)).encode())
PY
fi
python3 - <<'PY'
from adaptador import INPUT, load_spec, RealRuntime
from pathlib import Path
import servidor as s
spec=load_spec(INPUT/'input.json')
for item in (spec['baseline'], spec['candidate']):
    upload=s.BASE/item['sha']/'backend/uploads'
    upload.mkdir(mode=0o555)
    for name in ('evidencias', 'relatorios'):
        target=upload/name
        target.mkdir(mode=0o555)
        s.executar(['mount','--bind',str(s.PERSIST/name),str(target)])
        s.executar(['mount','-o','remount,bind,rw,nosuid,nodev,noexec',str(target)])
ops=RealRuntime(spec,Path('/etc/nr33/lab-schema.sha256').read_text().strip())
ops.authorize()
ops.prepare()
ops.activate(ops.previous)
ops.start()
ops.health(ops.previous)
ops.public_health(ops.previous)
PY
