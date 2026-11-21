#!/bin/bash
set -euo pipefail
cd /opt/nr33-source
mkdir -p /lab-results
diagnostics() {
  systemctl status nr33-backend nginx --no-pager > /lab-results/services.log 2>&1 || true
  journalctl -u nr33-backend -u nginx --no-pager > /lab-results/journal.log 2>&1 || true
  curl -v --max-time 10 --resolve nr33-rollback.invalid:443:127.0.0.1 https://nr33-rollback.invalid/api/health > /lab-results/curl.log 2>&1 || true
  findmnt --json > /lab-results/mounts.json
  { python3 --version; node --version; systemctl --version; nginx -v; uname -a; } > /lab-results/versions.log 2>&1
}
trap diagnostics EXIT
python3 -B -m unittest discover -s tests/cd -v > /lab-results/unit-root.log 2>&1
cat /lab-results/unit-root.log
/opt/nr33-lab/setup.sh > /lab-results/setup.log 2>&1
python3 -B /opt/nr33-lab/ensaio.py > /lab-results/operational.log 2>&1
cat /lab-results/operational.log
