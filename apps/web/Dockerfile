FROM node:24-alpine AS build
WORKDIR /src
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/game-core/package.json packages/game-core/
COPY packages/db/package.json packages/db/
COPY apps/api/package.json apps/api/
COPY apps/verifier/package.json apps/verifier/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile --filter @talus/web...
COPY packages/game-core packages/game-core
COPY apps/web apps/web
RUN pnpm --filter @talus/web build

FROM nginxinc/nginx-unprivileged:1.29-alpine
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /src/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
