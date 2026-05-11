# 1. Base image pinning
FROM node:20-alpine AS base

# Install compatibility libraries for alpine if needed (e.g. libc6-compat)
RUN apk add --no-cache libc6-compat
WORKDIR /app

# 2. Dependency Resolution Stage
FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm ci

# 3. Compilation & Build Stage
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Set dummy environment variables to allow build compilation to pass without errors
ENV SKIP_ENV_VALIDATION=true
ENV NEXT_PUBLIC_SUPABASE_URL=https://iykapuisyiynmqipjhcn.supabase.co
ENV SUPABASE_SERVICE_ROLE_KEY=dummy-service-key-for-compilation
ENV PORT=3000

RUN npm run build

# 4. Production Runner Stage
FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Enforce security hardening by utilizing a non-root system user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy essential runtime files
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.ts ./next.config.ts

USER nextjs

EXPOSE 3000

# Set Node memory-safe limits and garbage collection behavior for container
ENV NODE_OPTIONS="--max-old-space-size=1536"

CMD ["npm", "run", "start"]
