#!/bin/bash
set -euo pipefail
export PYTHONPATH=/usr/local/lib/nr33-cd
mkdir -p /lab-results
diagnostics() {
  systemctl show nr33-backend nginx nr33-lab-postgres > /lab-results/services-real.log || true
  journalctl -u nr33-backend -u nr33-lab-postgres --no-pager > /lab-results/journal-real.log || true
  findmnt --json > /lab-results/mounts-real.json
  { psql --version; node --version; python3 --version; systemctl --version; nginx -v; } > /lab-results/versions-real.log 2>&1
}
trap diagnostics EXIT
/opt/nr33-lab/setup-local.sh "${1:---prepared}" > /lab-results/setup-real.log 2>&1
python3 -B /opt/nr33-lab/test_adaptador.py > /lab-results/tests-real.log 2>&1
python3 -B /usr/local/lib/nr33-cd/adaptador.py > /lab-results/operational-real.log 2>&1
cat /lab-results/tests-real.log /lab-results/operational-real.log
