# Single-image build: React dashboard + Express API in one deployable service.
# better-sqlite3 needs native compilation, so the build stage carries build
# tools and the final image reuses its node_modules rather than reinstalling.

FROM node:20-bookworm-slim AS build
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY server/package.json server/package.json
COPY web/package.json web/package.json
RUN npm install

COPY . .
RUN npm run build

FROM node:20-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/server/package.json ./server/package.json
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/web/dist ./web/dist

EXPOSE 8787
CMD ["node", "server/dist/index.js"]
