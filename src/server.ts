#!/usr/bin/env bun
import {
  createConnection,
  TextDocuments,
  ProposedFeatures,
  InitializeParams,
  InitializeResult,
  TextDocumentSyncKind,
  StreamMessageReader,
  StreamMessageWriter,
  Connection,
  DidChangeConfigurationNotification,
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import { validateDocument } from "./validate";
import { setupCompletionHandler } from "./autocomplete";
import { FHIRModelProvider } from "@atomic-ehr/fhirpath";

// Server options interface
export interface ServerOptions {
  transport: "stdio" | "websocket";
  port?: number;
}

// Setup connection with all handlers
export async function setupConnection(connection: Connection): Promise<void> {
  // Create a simple text document manager
  const documents: TextDocuments<TextDocument> = new TextDocuments(
    TextDocument,
  );

  // Initialize FHIR model provider
  let modelProvider: FHIRModelProvider | undefined;
  let modelProviderInitPromise: Promise<void> | undefined;

  async function getModelProvider(): Promise<FHIRModelProvider> {
    if (!modelProvider) {
      modelProvider = new FHIRModelProvider({
        packages: [{ name: 'hl7.fhir.r4.core', version: '4.0.1' }],
        cacheDir: './.fhir-cache'
      });
      
      // Initialize the model provider (loads common types)
      if (!modelProviderInitPromise) {
        modelProviderInitPromise = modelProvider.initialize().catch(error => {
          connection.console.log('Failed to initialize FHIR model provider: ' + error);
          // Continue without model provider if initialization fails
        });
      }
      
      await modelProviderInitPromise;
    }
    
    return modelProvider;
  }

  let hasConfigurationCapability = false;
  let hasWorkspaceFolderCapability = false;

  connection.onInitialize((params: InitializeParams): InitializeResult => {
    const capabilities = params.capabilities;

    hasConfigurationCapability = !!(
      capabilities.workspace && !!capabilities.workspace.configuration
    );
    hasWorkspaceFolderCapability = !!(
      capabilities.workspace && !!capabilities.workspace.workspaceFolders
    );

    connection.console.log(
      `[Server] Initialized with workspace: ${params.rootUri}`,
    );

    const result: InitializeResult = {
      capabilities: {
        textDocumentSync: TextDocumentSyncKind.Incremental,
        completionProvider: {
          resolveProvider: true,
          triggerCharacters: [".", "(", "["],
        },
        hoverProvider: true,
        definitionProvider: true,
        referencesProvider: true,
        documentSymbolProvider: true,
        workspaceSymbolProvider: true,
        codeActionProvider: true,
        documentFormattingProvider: true,
      },
    };

    if (hasWorkspaceFolderCapability) {
      result.capabilities.workspace = {
        workspaceFolders: {
          supported: true,
        },
      };
    }

    return result;
  });

  connection.onInitialized(() => {
    connection.console.log("[Server] Connection initialized");

    if (hasConfigurationCapability) {
      // Register for all configuration changes
      connection.client.register(DidChangeConfigurationNotification.type, {});
    }

    if (hasWorkspaceFolderCapability) {
      connection.workspace.onDidChangeWorkspaceFolders((_event) => {
        connection.console.log(
          "[Server] Workspace folder change event received",
        );
      });
    }
  });

  // Document synchronization
  documents.onDidOpen(async (e) => {
    connection.console.log(`[Server] Document opened: ${e.document.uri}`);
    const provider = await getModelProvider();
    validateDocument(connection, e.document, provider);
  });

  documents.onDidChangeContent(async (change) => {
    connection.console.log(`[Server] Document changed: ${change.document.uri}`);
    const provider = await getModelProvider();
    validateDocument(connection, change.document, provider);
  });

  documents.onDidClose((e) => {
    connection.console.log(`[Server] Document closed: ${e.document.uri}`);
  });

  // Setup completion handler
  setupCompletionHandler(connection, documents, getModelProvider);

  // Hover
  connection.onHover((params) => {
    connection.console.log(
      `[Server] Hover requested at ${params.position.line}:${params.position.character}`,
    );

    const document = documents.get(params.textDocument.uri);
    if (!document) return null;

    const text = document.getText();
    const offset = document.offsetAt(params.position);

    // Find word at position
    let start = offset;
    let end = offset;
    while (start > 0 && /\w/.test(text[start - 1])) start--;
    while (end < text.length && /\w/.test(text[end])) end++;

    const word = text.substring(start, end);

    // Sample hover information
    const hoverInfo: { [key: string]: string } = {
      Patient:
        "FHIR Patient Resource - Demographics and administrative information",
      Observation: "FHIR Observation Resource - Measurements and assertions",
      where: "Filter function - where(criteria) filters collection",
      first: "Collection function - returns first item",
      name: "HumanName field - patient name information",
    };

    if (hoverInfo[word]) {
      return {
        contents: {
          kind: "markdown",
          value: `**${word}**\n\n${hoverInfo[word]}`,
        },
      };
    }

    return null;
  });

  // Make the text document manager listen on the connection
  documents.listen(connection);

  // Listen on the connection
  connection.listen();

  connection.console.log("[Server] FHIRPath Language Server started");
}

// WebSocket message handler for LSP
export class WebSocketLSPConnection {
  private connection: Connection | null = null;
  private messageBuffer: any[] = [];
  private ws: any = null;

  constructor() {
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
    setupConnection(this.connection);
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
export function createWebSocketHandlers() {
  const connections = new Map<any, WebSocketLSPConnection>();

  return {
    open(ws: any) {
      const lspConnection = new WebSocketLSPConnection();
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
