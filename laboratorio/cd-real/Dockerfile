FROM node:24-bookworm@sha256:9d266751ca3d7fdbe651c878ffd5ad0a42fed49a18c283509267c97f025b7496 AS node
FROM postgres:17@sha256:846a7ddaa67a4b354ae1d21087b683901aa6113a4ed626d3787cfbf6c85e3e07 AS prepared
ENV DEBIAN_FRONTEND=noninteractive container=docker
COPY --from=node /usr/local/ /usr/local/
RUN printf '#!/bin/sh\nexit 101\n' > /usr/sbin/policy-rc.d && chmod +x /usr/sbin/policy-rc.d && apt-get update && apt-get install -y --no-install-recommends systemd systemd-sysv nginx python3 openssl ca-certificates util-linux curl git && rm -rf /var/lib/apt/lists/* && ln -s /usr/local/bin/node /usr/bin/node
COPY scripts/cd /usr/local/lib/nr33-cd
COPY laboratorio/cd-real/adaptador.py laboratorio/cd-real/stage.py /usr/local/lib/nr33-cd/
COPY laboratorio/cd-real/staging/ /lab-input/
RUN install -d -m 0700 /opt/nr33-stage && install -d -o nobody -g nogroup -m 0700 /opt/nr33-stage/npm && chmod 0711 /opt/nr33-stage && python3 /usr/local/lib/nr33-cd/stage.py

FROM prepared AS runtime
RUN rm -rf /opt/nr33-stage && rm -f /lab-input/source.bundle
COPY laboratorio/cd-rollback/setup.sh /opt/nr33-lab/setup-services.sh
COPY laboratorio/cd-real/setup-local.sh laboratorio/cd-real/run.sh /opt/nr33-lab/
COPY laboratorio/cd-real/test_adaptador.py /opt/nr33-lab/
COPY laboratorio/cd-real/test_stage_security.py laboratorio/cd-real/fixtures.py /opt/nr33-lab/
RUN sed -i 's/\r$//' /opt/nr33-lab/*.sh && chmod 0755 /opt/nr33-lab/*.sh
STOPSIGNAL SIGRTMIN+3
ENTRYPOINT []
USER nobody
CMD ["/bin/bash"]
