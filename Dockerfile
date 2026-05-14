# syntax=docker/dockerfile:1
#
# Cloud Run image for the Luna Story API server.
# Lives at the repo root because the build needs the whole pnpm workspace as
# context (api-server depends on the @workspace/* packages under lib/).
#
# Build & deploy:  gcloud run deploy lunastory-api --source . --region asia-northeast3

# ---- Build stage: install workspace deps, bundle the API server ----
FROM node:24-slim AS build
RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @workspace/api-server build
# Self-contained deployable dir (prod node_modules + dist/index.cjs) at /deploy.
RUN pnpm --filter @workspace/api-server deploy --prod --legacy /deploy

# ---- Runtime stage: minimal image with just the bundled server ----
FROM node:24-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /deploy/node_modules ./node_modules
COPY --from=build /deploy/dist ./dist
# Cloud Run injects PORT (default 8080); index.ts reads process.env.PORT.
EXPOSE 8080
CMD ["node", "dist/index.cjs"]
