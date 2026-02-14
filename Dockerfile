# Multi-stage build for q-flow
FROM node:20-bookworm AS build
WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy source and build
COPY . .
RUN npm run build && npm prune --production

# Runtime image
FROM node:20-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production

# Copy production deps and built assets
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/server.js ./server.js
COPY --from=build /app/package*.json ./

# Ensure db file exists inside container (bind mount will override when present)
RUN [ -f /app/db.json ] || echo "{}" > /app/db.json

EXPOSE 3000
CMD ["node", "server.js"]
