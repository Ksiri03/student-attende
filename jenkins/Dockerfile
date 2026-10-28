# syntax=docker/dockerfile:1

# A local Jenkins controller with Node.js, Git and the Docker CLI preinstalled.
# The Docker socket is mounted at runtime so Jenkins can build the application image.

FROM jenkins/jenkins:lts-jdk17

USER root

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
        git \
        unzip \
        python3 \
        make \
        g++ \
    && rm -rf /var/lib/apt/lists/*

# Reuse the exact Node.js runtime that the application image uses.
COPY --from=node:22-bookworm-slim /usr/local/bin/node /usr/local/bin/node
COPY --from=node:22-bookworm-slim /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN ln -sf /usr/local/lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
    && ln -sf /usr/local/lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx

# Docker CLI + Buildx/Compose plugins used against the mounted Docker socket.
COPY --from=docker:27-cli /usr/local/bin/docker /usr/local/bin/docker
COPY --from=docker:27-cli /usr/local/libexec/docker/cli-plugins /usr/local/libexec/docker/cli-plugins
RUN ln -sf /usr/local/libexec/docker/cli-plugins/docker-compose /usr/local/bin/docker-compose

COPY plugins.txt /usr/share/jenkins/ref/plugins.txt
RUN jenkins-plugin-cli --plugin-file /usr/share/jenkins/ref/plugins.txt

COPY init.groovy.d/ /usr/share/jenkins/ref/init.groovy.d/

RUN git config --system --add safe.directory '*' \
    && git config --system --add safe.directory /workspace \
    && git config --system --add safe.directory /var/jenkins_home/workspace

USER jenkins

EXPOSE 8080 50000
