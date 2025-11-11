import {
  TextDocuments,
  InitializeParams,
  InitializeResult,
  TextDocumentSyncKind,
  Connection,
  DidChangeConfigurationNotification,
} from "vscode-languageserver";
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
export async function setupConnectionCommon(
  connection: Connection,
  makeModelProvider: () => FHIRModelProvider,
  providedModelProvider?: FHIRModelProvider
): Promise<void> {
  // Create a simple text document manager
  const documents: TextDocuments<TextDocument> = new TextDocuments(
    TextDocument,
  );

  // Initialize FHIR model provider
  let modelProvider: FHIRModelProvider | undefined = providedModelProvider;
  let modelProviderInitPromise: Promise<void> | undefined;

  async function getModelProvider(): Promise<FHIRModelProvider> {
    if (!modelProvider) {
      modelProvider = makeModelProvider();
      
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
