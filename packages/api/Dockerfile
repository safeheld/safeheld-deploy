# ─── Build stage ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies for native modules (bcrypt, canvas, etc.)
RUN apk add --no-cache python3 make g++

# Copy workspace manifests
COPY package.json package-lock.json ./
COPY packages/api/package.json ./packages/api/

# Install all workspace deps
RUN npm ci --workspace=packages/api

# Copy source
COPY packages/api/ ./packages/api/

# Generate Prisma client
RUN npm run -w packages/api prisma:generate

# Compile TypeScript
RUN npm run -w packages/api build

# ─── Production stage ─────────────────────────────────────────────────────────
FROM node:20-alpine AS production

WORKDIR /app

# Only install production deps
COPY package.json package-lock.json ./
COPY packages/api/package.json ./packages/api/

RUN npm ci --workspace=packages/api --omit=dev

# Copy compiled output and Prisma artefacts
COPY --from=builder /app/packages/api/dist          ./packages/api/dist
COPY --from=builder /app/packages/api/prisma        ./packages/api/prisma
COPY --from=builder /app/node_modules/.prisma        ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma        ./node_modules/@prisma

# Puppeteer: install Chromium at system level for PDF generation
RUN apk add --no-cache \
      chromium \
      nss \
      freetype \
      harfbuzz \
      ca-certificates \
      ttf-freefont \
  && addgroup -S appgroup \
  && adduser  -S appuser -G appgroup

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser \
    NODE_ENV=production

USER appuser

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3001/api/v1/health || exit 1

CMD ["node", "packages/api/dist/index.js"]
