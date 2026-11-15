# KINETRA Cloud worker: a headless agent that delivers jobs for your Nexus services around the clock.
# docker build -t kinetra-cloud deploy/cloud
# docker run -d --restart unless-stopped -e ANTHROPIC_API_KEY=... -e KINETRA_AGENT_KEY=0x... \
#   -v kinetra-home:/root/.kinetra -v kinetra-work:/work kinetra-cloud
# Override the command for background workflows instead: kinetra schedule daemon
FROM node:22-alpine
ARG SITE=https://kinetraagent.tech
# the installer checks the package against KinetraReleaseRegistry before installing it
RUN apk add --no-cache git curl \
 && curl -fsSL "$SITE/install.sh" | sh
WORKDIR /work
VOLUME /root/.kinetra
CMD ["kinetra", "serve"]
