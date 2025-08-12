# Use the official Bun image
FROM oven/bun:1.2.17-alpine

# Install git for GitHub dependencies
RUN apk add --no-cache git

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json bun.lock* ./

# Install dependencies (without frozen lockfile to allow GitHub deps)
RUN bun install

# Copy source code
COPY . .

# Expose the port (Render will override with PORT env var)
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT:-8080}/health || exit 1

# Start the debug server
CMD ["bun", "run", "debug/debug-server.ts"]
