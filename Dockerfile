ARG NODE_VERSION='22.11.0'

FROM node:${NODE_VERSION}-alpine AS build

ENV NPM_CONFIG_UPDATE_NOTIFIER=false
ENV NPM_CONFIG_FUND=false

WORKDIR /app

COPY package*.json tsconfig.json ./
COPY src ./src

RUN npm ci && \
    npm run build && \
    npm prune --production

FROM node:${NODE_VERSION}-alpine

RUN apk add --no-cache docker-cli curl && \
    SHOUTRRR_VERSION="0.8.0" && \
    curl -sSL "https://github.com/containrrr/shoutrrr/releases/download/v${SHOUTRRR_VERSION}/shoutrrr_linux_$(uname -m | sed 's/aarch64/arm64/' | sed 's/x86_64/amd64/').tar.gz" | tar xz -C /usr/local/bin shoutrrr && \
    apk del curl

WORKDIR /app

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./

CMD node dist/index.js
