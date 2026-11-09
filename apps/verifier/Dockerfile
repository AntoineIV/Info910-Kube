FROM node:24-alpine AS build
WORKDIR /src
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/game-core/package.json packages/game-core/
COPY packages/db/package.json packages/db/
COPY apps/api/package.json apps/api/
COPY apps/verifier/package.json apps/verifier/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile --filter @talus/verifier...
COPY packages packages
COPY apps/verifier apps/verifier
RUN pnpm --filter @talus/verifier build

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /src/apps/verifier/dist/index.js ./index.js
USER node
CMD ["node", "index.js"]
