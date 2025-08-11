# KRDS MCP Server Dockerfile
# Multi-stage build for optimized production image

# ============================================================================
# Build Stage
# ============================================================================
FROM node:18-alpine AS builder

# Set working directory
WORKDIR /app

# Install dependencies for native modules and Puppeteer
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# ============================================================================
# Production Stage  
# ============================================================================
FROM node:18-alpine AS production

# Install runtime dependencies
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    dumb-init

# Create app user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S krds -u 1001

# Set working directory
WORKDIR /app

# Copy built application
COPY --from=builder --chown=krds:nodejs /app/dist ./dist
COPY --from=builder --chown=krds:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=krds:nodejs /app/package*.json ./
COPY --from=builder --chown=krds:nodejs /app/config ./config

# Create necessary directories
RUN mkdir -p logs downloads && \
    chown -R krds:nodejs logs downloads

# Set Puppeteer to use system Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Switch to non-root user
USER krds

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "console.log('Health check')" || exit 1

# Start application with dumb-init
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/server.js"]