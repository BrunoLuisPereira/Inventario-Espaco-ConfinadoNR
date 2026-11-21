#!/bin/bash
set -euo pipefail
test "$(id -u)" = 0
test "$(cat /proc/1/comm)" = systemd
test -f /.dockerenv
test ! -e /etc/nr33/cd.json
install -d -m 0755 /run/nr33-lab /run/nr33 /run/nr33-cd /opt/nr33/releases /var/www/nr33 /etc/nr33 /etc/systemd/system/nr33-backend.service.d /var/lib/nr33/uploads /lab-results
install -d -m 0700 /var/lib/nr33/cd-logs
printf 'DISPOSABLE-NR33-LAB\n' > /run/nr33-lab/marker
useradd --system --no-create-home nr33lab
for name in evidencias relatorios; do
  install -d -o nr33lab -g nr33lab -m 0700 "/var/lib/nr33/uploads/$name"
done
printf 'SYNTHETIC=1\n' > /etc/nr33/backend.env
chmod 0600 /etc/nr33/backend.env
cat > /etc/systemd/system/nr33-backend.service <<'EOF'
[Unit]
Description=NR33 SYNTHETIC rollback lab
After=network.target
[Service]
User=nr33lab
Group=nr33lab
KillMode=control-group
TimeoutStopSec=10
Restart=no
ExecStart=/usr/bin/false
EOF
openssl req -x509 -newkey rsa:2048 -nodes -days 1 \
  -subj /CN=nr33-rollback.invalid \
  -addext subjectAltName=DNS:nr33-rollback.invalid \
  -keyout /etc/nr33/lab.key -out /usr/local/share/ca-certificates/nr33-lab.crt
chmod 0600 /etc/nr33/lab.key
update-ca-certificates
cat > /etc/nginx/sites-enabled/default <<'EOF'
server {
  listen 443 ssl;
  server_name nr33-rollback.invalid;
  ssl_certificate /usr/local/share/ca-certificates/nr33-lab.crt;
  ssl_certificate_key /etc/nr33/lab.key;
  root /var/www/nr33/current;
  location = /release.json { add_header Cache-Control no-store; try_files $uri =404; }
  location /api/ {
    if (-f /run/nr33/maintenance) { return 503; }
    proxy_pass http://127.0.0.1:3000;
  }
}
EOF
nginx -t
systemctl daemon-reload
systemctl restart nginx
