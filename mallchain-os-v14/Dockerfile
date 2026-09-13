# Mallchain Mission Control (mallchain-os-v14) — Vite build, served as
# static assets by nginx. Hash-based routing (see router.tsx) means no
# server-side rewrite rules are needed for deep links.
FROM node:20-alpine AS build
WORKDIR /app
# Vite inlines import.meta.env.VITE_* at BUILD time, not runtime — this must
# be a build ARG (and re-declared as ENV so `npm run build` below sees it),
# never a docker-compose `environment:` on the finished nginx container,
# which would have zero effect on already-built static JS.
ARG VITE_API_BASE_URL
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
# Same reasoning as backend/Dockerfile — patch OS packages at build time
# rather than trust the base image snapshot is current.
RUN apk upgrade --no-cache
RUN addgroup -g 1001 -S appuser && adduser -S appuser -u 1001 \
  && chown -R appuser:appuser /var/cache/nginx /var/run /var/log/nginx \
  && touch /var/run/nginx.pid && chown appuser:appuser /var/run/nginx.pid
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
USER appuser
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/ || exit 1
CMD ["nginx", "-g", "daemon off;"]
