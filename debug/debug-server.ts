#!/usr/bin/env bun
/// <reference path="./html.d.ts" />

// Import HTML as a module using Bun's HTML import feature
import indexHtml from './index.html';

// Import the WebSocket handlers from the actual LSP server
import { createWebSocketHandlers } from '../src/server';

// Import FHIRModelProvider to initialize it at startup
import { FHIRModelProvider } from '@atomic-ehr/fhirpath';

// Get port from environment variable (for Render) or use default
const port = parseInt(process.env.PORT || '8080', 10);

// Initialize the FHIR model provider at startup
console.log('Initializing FHIR Model Provider...');
const modelProvider = new FHIRModelProvider({
  packages: [{ name: 'hl7.fhir.r4.core', version: '4.0.1' }],
  cacheDir: './.fhir-cache'
});

// Initialize the model provider before starting the server
await modelProvider.initialize().then(() => {
  console.log('✅ FHIR Model Provider initialized successfully');
}).catch(error => {
  console.error('⚠️  Failed to initialize FHIR Model Provider:', error);
  console.log('Continuing without full type support...');
});

// Start HTTP server with HTML imports support and integrated LSP WebSocket
const server = Bun.serve({
  port: port,
  
  routes: {
    "/": indexHtml,
    "/health": {
      GET: (req) => {
        const host = req.headers.get('host') || `localhost:${port}`;
        const protocol = req.headers.get('x-forwarded-proto') || 'http';
        const wsProtocol = protocol === 'https' ? 'wss' : 'ws';
        return Response.json({
          status: 'running',
          debugServer: `${protocol}://${host}`,
          lspWebSocket: `${wsProtocol}://${host}/lsp`
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
  
  // Use the actual LSP WebSocket handlers from server.ts, passing the initialized model provider
  websocket: createWebSocketHandlers(modelProvider),
  
  development: {
    hmr: true,
    console: true,
  }
});

console.log('\n✨ Debug environment ready!');
console.log(`📍 Debug client: http://localhost:${port}`);
console.log(`🔌 LSP WebSocket: ws://localhost:${port}/lsp`);
console.log(`❤️  Health check: http://localhost:${port}/health\n`);

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