# ─── Build stage ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copy workspace manifests
COPY package.json package-lock.json ./
COPY packages/web/package.json ./packages/web/

# Install dependencies
RUN npm ci --workspace=packages/web

# Copy source
COPY packages/web/ ./packages/web/

# Build Vite app
# VITE_ vars must be set at build time if they need to be inlined
ARG VITE_APP_VERSION=unknown
ENV VITE_APP_VERSION=$VITE_APP_VERSION

RUN npm run -w packages/web build

# ─── Production stage — serve with nginx ─────────────────────────────────────
FROM nginx:1.25-alpine AS production

# Remove default nginx content
RUN rm -rf /usr/share/nginx/html/*

# Copy built assets
COPY --from=builder /app/packages/web/dist /usr/share/nginx/html

# Copy custom nginx config for SPA routing
COPY nginx/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:80/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
