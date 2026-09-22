FROM node:26-alpine AS builder
WORKDIR /app
COPY package*.json .npmrc ./
ARG GITHUB_TOKEN
RUN echo "//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}" >> .npmrc && \
    npm ci && \
    rm -f .npmrc
COPY . .
RUN npm run build

FROM node:26-alpine AS runner
LABEL io.modelcontextprotocol.server.name="io.github.WYRE-AI/halopsa-mcp"
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 mcp
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
USER mcp
EXPOSE 8080
# Probe 127.0.0.1, not localhost. Inside the image, localhost resolves to ::1
# first, but the server binds MCP_HTTP_HOST=0.0.0.0 (IPv4 only), so the IPv6
# attempt is connection refused and the container stays unhealthy. The port
# comes from MCP_HTTP_PORT so a non-default port is probed too.
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider "http://127.0.0.1:${MCP_HTTP_PORT:-8080}/health" || exit 1
ENV MCP_TRANSPORT=http
ENV MCP_HTTP_PORT=8080
ENV MCP_HTTP_HOST=0.0.0.0
ENV AUTH_MODE=env
CMD ["node", "dist/index.js"]
