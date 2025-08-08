# Minimal LSP Server

A minimalistic Language Server Protocol implementation in TypeScript.

## Features

- ✅ **Diagnostics** - Detects "error", "warning", and "todo" keywords
- ✅ **Completion** - Basic auto-completion with function, variable, and keyword suggestions
- ✅ **Hover** - Shows information when hovering over words
- ✅ **Go to Definition** - Basic definition provider

## Project Structure

```
lsp-server/
├── src/
│   └── server.ts         # LSP server implementation
├── client/
│   ├── src/
│   │   └── extension.ts  # VS Code extension
│   ├── language-configuration.json
│   ├── package.json
│   └── tsconfig.json
├── package.json
├── tsconfig.json
└── README.md
```

## Setup

1. Install dependencies:
```bash
cd lsp-server
bun install

cd client
bun install
```

2. Build the project:
```bash
# In lsp-server directory
bun run build

# In client directory
cd client
bun run build
```

3. Run in VS Code:
```bash
# From lsp-server directory
bun run dev
```

Or press `F5` in VS Code with the client folder open.

## How It Works

### Server (`src/server.ts`)
- Creates LSP connection using Node IPC
- Implements handlers for:
  - `initialize` - Declares server capabilities
  - `onCompletion` - Provides completion items
  - `onHover` - Shows hover information
  - `onDefinition` - Go to definition
  - `onDidChangeContent` - Validates document and sends diagnostics

### Client (`client/src/extension.ts`)
- VS Code extension that starts the language server
- Configures language client with:
  - Document selectors (plaintext and .minimal files)
  - Server module path
  - Communication transport (IPC)

## Extending

To add more features:

1. **Add capability** in `server.ts` `onInitialize`:
```typescript
renameProvider: true
```

2. **Implement handler**:
```typescript
connection.onRenameRequest((params) => {
  // Implementation
});
```

3. **Test** with a sample file in VS Code

## Minimal Dependencies

- `vscode-languageserver`: Core LSP protocol
- `vscode-languageserver-textdocument`: Document management
- `vscode-languageclient`: Client for VS Code extension

That's it! This is all you need for a working LSP server.