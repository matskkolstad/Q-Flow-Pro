# Multi-stage build for q-flow
FROM node:22-bookworm AS build
WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy source and build
COPY . .
RUN npm run build && npm prune --omit=dev

# Runtime image
FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
# All runtime data (SQLite database, logs, backups) lives here; mount it as a volume.
ENV QFLOW_DATA_DIR=/app/data

# Copy production deps and built assets
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/server.js ./server.js
COPY --from=build /app/lib ./lib
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/package*.json ./

RUN mkdir -p /app/data
VOLUME ["/app/data"]

EXPOSE 3000
CMD ["node", "server.js"]
