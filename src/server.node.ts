#!/usr/bin/env bun
import {
  createConnection,
  StreamMessageReader,
  StreamMessageWriter,
  Connection,
} from "vscode-languageserver/node";

import { FHIRModelProvider } from "@atomic-ehr/fhirpath";
import { setupConnectionCommon } from "./server.common";

// Server options interface
export interface ServerOptions {
  transport: "stdio" | "websocket";
  port?: number;
}

export async function setupConnection(
  connection: Connection,
  providedModelProvider?: FHIRModelProvider
): Promise<void> {
  setupConnectionCommon(
    connection,
    () => {
      return new FHIRModelProvider({
        packages: [{ name: 'hl7.fhir.r4.core', version: '4.0.1' }],
        cacheDir: './.fhir-cache'
      })
    },
    providedModelProvider
  )
}

// WebSocket message handler for LSP
export class WebSocketLSPConnection {
  private connection: Connection | null = null;
  private messageBuffer: any[] = [];
  private ws: any = null;

  constructor(private modelProvider?: FHIRModelProvider) {
    // Create custom message reader/writer for WebSocket
    const reader = {
      onError: (_error: any) => {},
      onClose: (_handler: any) => {},
      onPartialMessage: (_handler: any) => {},
      listen: (callback: (message: any) => void) => {
        // Process buffered messages
        while (this.messageBuffer.length > 0) {
          const msg = this.messageBuffer.shift();
          callback(msg);
        }
        // Set up listener for future messages
        this.onMessage = callback;
      },
      dispose: () => {},
    };

    const writer = {
      onError: (_error: any) => {},
      onClose: (_handler: any) => {},
      write: (message: any) => {
        if (this.ws && this.ws.readyState === 1) {
          this.ws.send(JSON.stringify(message));
        }
        return Promise.resolve();
      },
      end: () => {},
      dispose: () => {},
    };

    // Create the connection
    this.connection = createConnection(reader as any, writer as any);
    setupConnection(this.connection, this.modelProvider);
  }

  private onMessage: ((message: any) => void) | null = null;

  handleWebSocketOpen(ws: any) {
    this.ws = ws;
    console.log("[Server] WebSocket client connected");
  }

  handleWebSocketMessage(message: string | Buffer) {
    try {
      const parsed =
        typeof message === "string"
          ? JSON.parse(message)
          : JSON.parse(message.toString());
      console.log(
        "[Server] Received:",
        parsed.method || `response:${parsed.id}`,
      );

      if (this.onMessage) {
        this.onMessage(parsed);
      } else {
        this.messageBuffer.push(parsed);
      }
    } catch (e) {
      console.error("[Server] Failed to parse message:", e);
    }
  }

  handleWebSocketClose() {
    console.log("[Server] WebSocket client disconnected");
    this.ws = null;
    if (this.connection) {
      this.connection.dispose();
    }
  }
}

// Create WebSocket handlers for Bun.serve
export function createWebSocketHandlers(modelProvider?: FHIRModelProvider) {
  const connections = new Map<any, WebSocketLSPConnection>();

  return {
    open(ws: any) {
      const lspConnection = new WebSocketLSPConnection(modelProvider);
      connections.set(ws, lspConnection);
      lspConnection.handleWebSocketOpen(ws);
    },

    message(ws: any, message: string | Buffer) {
      const lspConnection = connections.get(ws);
      if (lspConnection) {
        lspConnection.handleWebSocketMessage(message);
      }
    },

    close(ws: any) {
      const lspConnection = connections.get(ws);
      if (lspConnection) {
        lspConnection.handleWebSocketClose();
        connections.delete(ws);
      }
    },
  };
}

// Start server with specified transport
function startServer(options: ServerOptions): void {
  console.error(`[Server] Starting with ${options.transport} transport`);

  if (options.transport === "stdio") {
    // Create connection for stdio
    const connection = createConnection(
      new StreamMessageReader(process.stdin),
      new StreamMessageWriter(process.stdout),
    );

    setupConnection(connection);
  } else if (options.transport === "websocket") {
    const port = options.port || 3000;
    console.error(`[Server] WebSocket server starting on port ${port}`);

    // Create WebSocket server using Bun
    Bun.serve({
      port,
      fetch(req, server) {
        // Upgrade to WebSocket
        if (server.upgrade(req)) {
          return; // Connection upgraded to WebSocket
        }

        // Return a simple HTTP response for non-WebSocket requests
        return new Response(
          "FHIRPath LSP WebSocket Server\n\nConnect via WebSocket to use LSP",
          {
            headers: { "Content-Type": "text/plain" },
          },
        );
      },
      websocket: createWebSocketHandlers(),
    });

    console.error(
      `[Server] WebSocket server listening on ws://localhost:${port}`,
    );
  } else {
    console.error(`[Server] Unknown transport: ${options.transport}`);
    process.exit(1);
  }
}

// Main entry point
if (import.meta.main) {
  // Parse command-line arguments
  const args = process.argv.slice(2);
  const transport: "stdio" | "websocket" = args.includes("--websocket")
    ? "websocket"
    : "stdio";
  const portArg = args.find((arg) => arg.startsWith("--port="));
  const port = portArg ? parseInt(portArg.split("=")[1], 10) : 3000;

  // Start the server
  startServer({ transport, port });
}

// Export for testing
export { startServer };
