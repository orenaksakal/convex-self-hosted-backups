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

WORKDIR /app

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./

CMD node dist/index.js
