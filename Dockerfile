# Playwright's bundled browser binaries need glibc, not musl - this base
# image ships them preinstalled and matched to the @playwright/test version
# pinned in package.json (keep both in lockstep on version bumps).
FROM mcr.microsoft.com/playwright:v1.59.1-noble

ENV TZ="Europe/London"

USER root

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
    curl \
    zip \
    unzip \
    openjdk-17-jre-headless \
    && rm -rf /var/lib/apt/lists/*

RUN curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip" \
    && unzip awscliv2.zip \
    && ./aws/install \
    && rm -rf awscliv2.zip aws

WORKDIR /app

COPY . .
RUN npm install --ignore-scripts

ENTRYPOINT [ "./entrypoint.sh" ]

# This is downloading the linux amd64 aws cli. For M1 macs build and run with the --platform=linux/amd64 argument. eg docker build . --platform=linux/amd64
