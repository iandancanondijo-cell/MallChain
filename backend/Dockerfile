# Dependencies stage (production-only deps, no devDependencies in the final image)
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

# Production stage
FROM node:20-alpine
# The node:20-alpine tag is floating but still lags Alpine's own package repo
# by hours-to-days — Trivy caught OpenSSL (libcrypto3/libssl3) HIGH CVEs
# fixed upstream but not yet in the base image snapshot this pulled. Force
# a package refresh at build time rather than wait on the next base image
# publish.
RUN apk upgrade --no-cache
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001
WORKDIR /app
COPY --from=deps /app/package*.json ./
COPY --from=deps /app/node_modules ./node_modules
COPY src ./src
USER nodejs
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:4000/api/health || exit 1
CMD ["node", "-r", "./src/tracing.js", "src/index.js"]
