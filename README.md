# FHIRPath Language Server Protocol (LSP) Implementation

A Language Server Protocol implementation for FHIRPath expressions, providing intelligent IDE support for FHIR query language development.

🚀 **[Live Demo](https://fhirpath-lsp2.onrender.com/)** - Try the FHIRPath LSP in your browser!

## Overview

This project implements an LSP server for FHIRPath, a path-based navigation and extraction language for FHIR (Fast Healthcare Interoperability Resources). The server provides real-time validation, syntax checking, and intelligent code assistance for FHIRPath expressions.

## Features

- **Real-time Validation**: Validates FHIRPath expressions as you type using the `@atomic-ehr/fhirpath` analyzer
- **FHIR R4 Support**: Built-in support for FHIR R4.0.1 data model with type checking
- **Multiple Transport Modes**: 
  - Standard I/O (stdio) for traditional editor integration
  - WebSocket for web-based editors and remote connections
- **Code Intelligence**:
  - Syntax error detection and reporting
  - Hover information for FHIRPath elements
  - Auto-completion for FHIR resources and FHIRPath functions
  - Document symbol navigation
- **Debug Interface**: Web-based debug client for testing and development

## Architecture

### Core Components

- **`src/server.ts`**: Main LSP server implementation
  - Handles connection setup (stdio/WebSocket)
  - Manages LSP protocol communication
  - Provides completion, hover, and navigation features
  - WebSocket connection management for browser-based clients

- **`src/validate.ts`**: FHIRPath validation engine
  - Integrates with `@atomic-ehr/fhirpath` analyzer
  - Manages FHIR R4 model provider
  - Converts FHIRPath diagnostics to LSP format
  - Caches FHIR model data in `.fhir-cache` directory

### Debug Tools

- **`debug/debug-server.ts`**: Development server using Bun.serve
  - Serves the debug client interface
  - Provides integrated LSP WebSocket endpoint
  - Hot module replacement for development
  - Health check endpoint

- **`debug/index.html`**: Web-based LSP client
  - CodeMirror editor integration
  - Real-time diagnostic display
  - LSP message inspector
  - Visual feedback for errors and warnings

- **`debug/client.ts`**: Browser-side LSP client implementation
  - WebSocket connection management
  - LSP protocol handling
  - Editor synchronization

### Testing

- **`test/server.test.ts`**: Server integration tests
- **`test/validate.test.ts`**: Validation logic tests
- **`test/lsp-test-client.ts`**: LSP client for testing

## Installation

```bash
bun install
```

## Usage

### Running the LSP Server

**Standard I/O mode** (for editor integration):
```bash
bun run lsp:stdio
```

**WebSocket mode** (default port 3000):
```bash
bun run lsp:websocket
```

**WebSocket with custom port**:
```bash
bun run lsp:websocket:port  # Uses port 4000
# or
bun src/server.ts --websocket --port=5000
```

### Development Mode

Run the debug server with hot reload:
```bash
bun run debug
```

This starts:
- Debug client at http://localhost:8080
- LSP WebSocket at ws://localhost:8080/lsp
- Health check at http://localhost:8080/health

### Building

Compile TypeScript to JavaScript:
```bash
bun run build
```

Watch mode for development:
```bash
bun run watch
```

### Testing

Run all tests:
```bash
bun test
```

Watch mode for tests:
```bash
bun run test:watch
```

## LSP Capabilities

The server currently supports:

- **Text Document Sync**: Incremental synchronization
- **Completion**: Context-aware suggestions for FHIR resources and FHIRPath functions
- **Hover**: Information about elements under cursor
- **Diagnostics**: Real-time error and warning detection
- **Definition Provider**: Navigate to definitions
- **References Provider**: Find all references
- **Document Symbols**: Outline view support
- **Workspace Symbols**: Project-wide symbol search
- **Code Actions**: Quick fixes and refactoring
- **Document Formatting**: Code formatting support

## Configuration

The server uses the following configuration:

- **FHIR Package**: hl7.fhir.r4.core v4.0.1
- **Cache Directory**: `./.fhir-cache` for FHIR model data
- **Error Recovery**: Enabled for better IDE experience

## Integration

### VS Code Extension

The server can be integrated into VS Code through a custom extension. Place extension files in the `client/` directory and use the development command:

```bash
bun run dev
```

### Web-Based Editors

Connect to the WebSocket endpoint for browser-based integration:

```javascript
const ws = new WebSocket('ws://localhost:3000');
// Send LSP messages as JSON
```

## Dependencies

- **Runtime**: Bun (for native TypeScript execution and WebSocket support)
- **LSP Implementation**: vscode-languageserver
- **FHIRPath Analysis**: @atomic-ehr/fhirpath
- **Development**: TypeScript, CodeMirror (for debug client)

## Project Structure

```
fhirpath-lsp-2/
├── src/                    # Source code
│   ├── server.ts          # Main LSP server
│   └── validate.ts        # Validation logic
├── debug/                  # Debug tools
│   ├── debug-server.ts    # Development server
│   ├── index.html         # Debug client UI
│   └── client.ts          # Browser LSP client
├── test/                   # Test files
│   ├── server.test.ts     # Server tests
│   ├── validate.test.ts   # Validation tests
│   └── lsp-test-client.ts # Test utilities
├── docs/                   # Documentation
│   ├── lsp-basics.md      # LSP concepts
│   └── lsp-inspector.md   # Debug tools guide
├── out/                    # Compiled output
└── package.json           # Project configuration
```

## License

This project is part of the Atomic EHR organization's FHIRPath tooling ecosystem.