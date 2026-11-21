FROM node:24-bookworm@sha256:9d266751ca3d7fdbe651c878ffd5ad0a42fed49a18c283509267c97f025b7496
ENV DEBIAN_FRONTEND=noninteractive container=docker
RUN printf '#!/bin/sh\nexit 101\n' > /usr/sbin/policy-rc.d && chmod +x /usr/sbin/policy-rc.d
RUN apt-get update && apt-get install -y --no-install-recommends systemd systemd-sysv nginx python3 openssl ca-certificates util-linux curl git && rm -rf /var/lib/apt/lists/*
COPY scripts/cd /usr/local/lib/nr33-cd
COPY tests/cd /opt/nr33-source/tests/cd
COPY scripts/cd /opt/nr33-source/scripts/cd
COPY infra/cd /opt/nr33-source/infra/cd
COPY .github/workflows/cd-homologacao.yml /opt/nr33-source/.github/workflows/cd-homologacao.yml
COPY laboratorio/cd-rollback/setup.sh laboratorio/cd-rollback/run.sh laboratorio/cd-rollback/ensaio.py laboratorio/cd-rollback/backend.cjs /opt/nr33-lab/
RUN sed -i 's/\r$//' /opt/nr33-lab/*.sh && chmod 0755 /opt/nr33-lab/*.sh && ln -s /usr/local/bin/node /usr/bin/node && ln -s /usr/sbin/runuser /usr/local/bin/runuser
STOPSIGNAL SIGRTMIN+3
# Default seguro; o launcher opta explicitamente por root/systemd no ensaio isolado.
USER node
CMD ["/bin/bash"]
