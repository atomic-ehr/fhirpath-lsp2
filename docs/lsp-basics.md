# LSP Basics

## What is Language Server Protocol?

The Language Server Protocol (LSP) is a standardized protocol used between a development tool (client) and a language server that provides language features. It enables consistent language support across different editors and IDEs.

## Core Concepts

### Client-Server Architecture
- **Client**: The editor/IDE (VS Code, Vim, Emacs, etc.)
- **Server**: Language-specific backend providing intelligent features
- **Communication**: JSON-RPC 2.0 messages over stdin/stdout or sockets

### Key Features Provided by LSP

1. **Diagnostics**: Errors, warnings, and hints
2. **Completion**: Code completion suggestions
3. **Hover**: Information on hover over symbols
4. **Signature Help**: Function/method signatures while typing
5. **Go to Definition**: Navigate to symbol definitions
6. **Find References**: Find all references to a symbol
7. **Document Symbols**: Outline of symbols in a document
8. **Code Actions**: Quick fixes and refactoring
9. **Formatting**: Code formatting
10. **Rename**: Rename symbols across files

## Message Types

### Request/Response
Client sends a request, server responds:
```json
// Request
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "textDocument/completion",
  "params": {
    "textDocument": { "uri": "file:///path/to/file.fhirpath" },
    "position": { "line": 10, "character": 5 }
  }
}

// Response
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "items": [
      { "label": "Patient", "kind": 7 }
    ]
  }
}
```

### Notifications
One-way messages (no response expected):
```json
{
  "jsonrpc": "2.0",
  "method": "textDocument/didOpen",
  "params": {
    "textDocument": {
      "uri": "file:///path/to/file.fhirpath",
      "languageId": "fhirpath",
      "version": 1,
      "text": "Patient.name.given"
    }
  }
}
```

## Lifecycle

1. **Initialize**: Client sends `initialize` request with capabilities
2. **Initialized**: Client notifies server it's ready
3. **Document Sync**: Client sends document open/change/close notifications
4. **Feature Requests**: Client requests language features as needed
5. **Shutdown**: Client requests server shutdown
6. **Exit**: Client notifies server to exit

## Document Synchronization

### Sync Methods
- **Full**: Send entire document content on each change
- **Incremental**: Send only the changed portions

### Key Events
- `textDocument/didOpen`: Document opened
- `textDocument/didChange`: Document modified
- `textDocument/didSave`: Document saved
- `textDocument/didClose`: Document closed

## Position and Range

Positions in LSP are zero-indexed:
```typescript
interface Position {
  line: number;      // 0-based
  character: number; // 0-based, UTF-16 code units
}

interface Range {
  start: Position;
  end: Position;
}
```

## Capabilities

### Server Capabilities
Server declares what it supports:
```typescript
{
  completionProvider: {
    triggerCharacters: [".", "("],
    resolveProvider: true
  },
  hoverProvider: true,
  definitionProvider: true,
  referencesProvider: true,
  documentSymbolProvider: true
}
```

### Client Capabilities
Client declares what it can handle:
```typescript
{
  textDocument: {
    completion: {
      completionItem: {
        snippetSupport: true,
        documentationFormat: ["markdown", "plaintext"]
      }
    }
  }
}
```

## Implementation Tips

1. **Start Simple**: Begin with basic features (diagnostics, completion)
2. **Incremental Sync**: More efficient for large documents
3. **Async Processing**: Don't block on expensive operations
4. **Caching**: Cache parsed ASTs and symbol tables
5. **Error Handling**: Gracefully handle malformed requests
6. **Logging**: Implement detailed logging for debugging
7. **Testing**: Test with multiple clients for compatibility

## Common Libraries

### TypeScript/JavaScript
- `vscode-languageserver`: Microsoft's LSP implementation
- `vscode-languageserver-protocol`: Protocol types and utilities
- `vscode-languageserver-textdocument`: Text document management utilities

## vscode-languageserver Library

The `vscode-languageserver` library provides comprehensive tools for building LSP servers:

### Core Components

#### 1. Connection Management
- `createConnection()` - Creates JSON-RPC connection between client and server
- Handles stdin/stdout or socket communication
- Manages the message protocol layer

#### 2. Request/Response Handlers
- `connection.onInitialize()` - Server initialization
- `connection.onCompletion()` - Code completion
- `connection.onHover()` - Hover information
- `connection.onDefinition()` - Go to definition
- `connection.onReferences()` - Find references
- `connection.onDocumentSymbol()` - Document symbols
- `connection.onCodeAction()` - Code actions/quick fixes
- `connection.onDocumentFormatting()` - Format document
- `connection.onRenameRequest()` - Rename symbol
- `connection.onSignatureHelp()` - Signature help
- `connection.onExecuteCommand()` - Execute custom commands

#### 3. Document Synchronization
- `connection.onDidOpenTextDocument()` - Document opened
- `connection.onDidChangeTextDocument()` - Document modified
- `connection.onDidCloseTextDocument()` - Document closed
- `connection.onDidSaveTextDocument()` - Document saved
- `connection.onWillSaveTextDocument()` - Before save

#### 4. Diagnostics
- `connection.sendDiagnostics()` - Send errors/warnings to client
- `DiagnosticSeverity` - Error, Warning, Information, Hint
- Related information and code actions for diagnostics

#### 5. Workspace Features
- `connection.workspace.getWorkspaceFolders()` - Get workspace folders
- `connection.workspace.getConfiguration()` - Get configuration
- `connection.workspace.applyEdit()` - Apply workspace edits
- File system watchers for tracking file changes
- Symbol search across workspace

#### 6. Protocol Types
All TypeScript types for LSP protocol:
- **Documents**: `TextDocument`, `TextDocumentIdentifier`, `VersionedTextDocumentIdentifier`
- **Positions**: `Position`, `Range`, `Location`, `LocationLink`
- **Edits**: `TextEdit`, `WorkspaceEdit`, `CreateFile`, `RenameFile`, `DeleteFile`
- **Completions**: `CompletionItem`, `CompletionList`, `CompletionItemKind`, `InsertTextFormat`
- **Diagnostics**: `Diagnostic`, `DiagnosticSeverity`, `DiagnosticTag`
- **Symbols**: `SymbolInformation`, `DocumentSymbol`, `SymbolKind`
- **Actions**: `Command`, `CodeAction`, `CodeActionKind`

#### 7. Utilities
- `TextDocumentSyncKind` - None, Full, Incremental
- `CompletionItemKind` - Text, Method, Function, Constructor, Field, Variable, Class, etc.
- `SymbolKind` - File, Module, Namespace, Package, Class, Method, Property, etc.
- `ProposedFeatures` - Access to experimental LSP features
- `ErrorCodes` - Standard JSON-RPC error codes

#### 8. Advanced Features
- **Progress Reporting**: Show progress for long-running operations
- **Window Messages**: `connection.window.showInformationMessage()`, `showWarningMessage()`, `showErrorMessage()`
- **Client Capabilities**: Negotiate features based on client support
- **Partial Results**: Stream results for large responses
- **Cancellation**: Handle request cancellation via `CancellationToken`
- **Telemetry**: Send telemetry events to client
- **Log Messages**: `connection.console.log()`, `error()`, `warn()`, `info()`

### Example Server Structure
```typescript
import {
  createConnection,
  TextDocuments,
  ProposedFeatures,
  InitializeParams,
  InitializeResult
} from 'vscode-languageserver/node';

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);

connection.onInitialize((params: InitializeParams): InitializeResult => {
  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      completionProvider: {
        resolveProvider: true
      }
    }
  };
});

documents.listen(connection);
connection.listen();
```

## Resources

- [Official LSP Specification](https://microsoft.github.io/language-server-protocol/)
- [VS Code Language Server Extension Guide](https://code.visualstudio.com/api/language-extensions/language-server-extension-guide)
- [LSP Inspector](https://microsoft.github.io/language-server-protocol/inspector/)