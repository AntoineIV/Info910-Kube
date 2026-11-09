FROM node:24-alpine AS build
WORKDIR /src
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/game-core/package.json packages/game-core/
COPY packages/db/package.json packages/db/
COPY apps/api/package.json apps/api/
COPY apps/verifier/package.json apps/verifier/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile --filter @talus/api...
COPY packages packages
COPY apps/api apps/api
RUN pnpm --filter @talus/api build

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /src/apps/api/dist/index.js ./index.js
COPY --from=build /src/packages/db/drizzle ./migrations
ENV MIGRATIONS_DIR=/app/migrations PORT=3000
USER node
EXPOSE 3000
CMD ["node", "index.js"]
