#!/usr/bin/env bun

// Import HTML as a module using Bun's HTML import feature
import indexHtml from './index.html';

// Import the WebSocket handlers from the actual LSP server
import { createWebSocketHandlers } from '../src/server';

// Start HTTP server with HTML imports support and integrated LSP WebSocket
const server = Bun.serve({
  port: 8080,
  
  routes: {
    "/": indexHtml,
    "/health": {
      GET: (req) => {
        return Response.json({
          status: 'running',
          debugServer: 'http://localhost:8080',
          lspWebSocket: 'ws://localhost:8080/lsp'
        });
      }
    }
  },
  
  fetch(req, server) {
    const url = new URL(req.url);
    
    // Handle WebSocket upgrade for /lsp path
    if (url.pathname === '/lsp') {
      if (server.upgrade(req)) {
        return; // Connection upgraded to WebSocket
      }
      return new Response('WebSocket upgrade failed', { status: 400 });
    }
    
    // Fallback for unmatched routes
    return new Response('Not found', { status: 404 });
  },
  
  // Use the actual LSP WebSocket handlers from server.ts
  websocket: createWebSocketHandlers(),
  
  development: {
    hmr: true,
    console: true,
  }
});

console.log('\n✨ Debug environment ready!');
console.log('📍 Debug client: http://localhost:8080');
console.log('🔌 LSP WebSocket: ws://localhost:8080/lsp');
console.log('❤️  Health check: http://localhost:8080/health\n');

// Cleanup on exit
process.on('SIGINT', () => {
  console.log('\nShutting down...');
  server.stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  server.stop();
  process.exit(0);
});