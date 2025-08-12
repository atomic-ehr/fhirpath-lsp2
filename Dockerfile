# Use the official Bun image
FROM oven/bun:1.2.17-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json bun.lockb* ./

# Install dependencies
RUN bun install --frozen-lockfile

# Copy source code
COPY . .

# Build TypeScript if needed (optional, Bun can run TS directly)
# RUN bun run build

# Expose the port (Render will override with PORT env var)
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT:-8080}/health || exit 1

# Start the debug server
CMD ["bun", "run", "debug/debug-server.ts"]