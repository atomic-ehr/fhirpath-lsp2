# LSP Inspector for Development

## Overview

The LSP Inspector is an interactive tool that helps visualize and debug the communication between your Language Server and VS Code client. It's essential for understanding the message flow and troubleshooting issues during development.

## Web-based Inspector

Microsoft provides a web-based LSP Inspector at:
https://microsoft.github.io/language-server-protocol/inspector/

GitHub Repository:
https://github.com/microsoft/language-server-protocol-inspector

## Enabling LSP Tracing in VS Code

### Method 1: User Settings

1. Open VS Code settings (Cmd+, on Mac, Ctrl+, on Windows/Linux)
2. Search for "minimalLsp.trace.server" (or your language server's trace setting)
3. Set it to "verbose" to capture all LSP messages

### Method 2: Settings JSON

Add to your VS Code settings.json:
```json
{
  "minimalLsp.trace.server": "verbose"
}
```

### Method 3: Launch Configuration

In your `.vscode/launch.json`, add trace settings to your configuration:
```json
{
  "type": "extensionHost",
  "request": "launch",
  "name": "Launch Extension",
  "runtimeExecutable": "${execPath}",
  "args": [
    "--extensionDevelopmentPath=${workspaceFolder}/client",
    "--trace-server-verbose"
  ],
  "env": {
    "minimalLsp.trace.server": "verbose"
  }
}
```

## Viewing LSP Logs

### In VS Code Output Panel

1. Open the Output panel (View → Output)
2. Select "Minimal LSP" (or your language server name) from the dropdown
3. You'll see all LSP messages in real-time

Example output:
```
[Trace - 10:15:32 AM] Sending request 'initialize - (0)'.
Params: {
    "processId": 12345,
    "rootUri": "file:///workspace",
    "capabilities": { ... }
}

[Trace - 10:15:32 AM] Received response 'initialize - (0)' in 15ms.
Result: {
    "capabilities": {
        "textDocumentSync": 2,
        "completionProvider": {
            "triggerCharacters": [".", "("]
        }
    }
}
```

### Using the Web Inspector

1. Copy the LSP trace logs from VS Code's output panel
2. Go to https://microsoft.github.io/language-server-protocol/inspector/
3. Paste your logs into the inspector
4. Use the interactive features:
   - Click each message to expand details
   - Filter by message type or search query
   - Filter by language features (completion, hover, etc.)
   - View timing information

## Understanding LSP Messages

### Message Types

- **send-request**: Client → Server request
- **recv-request**: Server receives request
- **send-response**: Server → Client response
- **recv-response**: Client receives response
- **send-notification**: One-way message sent
- **recv-notification**: One-way message received

### Common Messages to Watch

1. **Initialization**
   - `initialize`: Handshake between client and server
   - `initialized`: Client is ready

2. **Document Sync**
   - `textDocument/didOpen`: File opened
   - `textDocument/didChange`: File modified
   - `textDocument/didSave`: File saved
   - `textDocument/didClose`: File closed

3. **Language Features**
   - `textDocument/completion`: Code completion request
   - `textDocument/hover`: Hover information
   - `textDocument/definition`: Go to definition
   - `textDocument/references`: Find references
   - `textDocument/publishDiagnostics`: Errors/warnings

## Debugging Tips

### 1. Check Initialization
Verify the server capabilities match what you expect:
```typescript
// In your server's onInitialize handler
connection.onInitialize((params): InitializeResult => {
  console.error('Client capabilities:', JSON.stringify(params.capabilities, null, 2));
  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      completionProvider: {
        resolveProvider: true,
        triggerCharacters: ['.', '(']
      }
      // ... other capabilities
    }
  };
});
```

### 2. Add Server-side Logging
```typescript
// Log to VS Code output (appears in trace)
connection.console.log('Server message');
connection.console.error('Error details');

// Log to stderr (for debugging)
console.error('Debug:', data);
```

### 3. Common Issues to Check

- **No messages**: Check activation events in package.json
- **Missing features**: Verify capabilities in initialize response
- **Wrong document**: Check URI and language ID in didOpen
- **Stale completions**: Verify document version tracking

### 4. Performance Analysis
The inspector shows timing for each request:
- Look for slow responses (>100ms for completion)
- Identify unnecessary requests
- Check for request flooding

## Advanced Usage

### Custom Message Logging
Add custom tracing in your server:
```typescript
function logMessage(method: string, params: any) {
  const timestamp = new Date().toISOString();
  connection.console.log(`[${timestamp}] ${method}: ${JSON.stringify(params)}`);
}

connection.onCompletion((params) => {
  logMessage('completion', params);
  // ... handle completion
});
```

### Filtering Large Logs
For large trace files, use command-line tools:
```bash
# Extract only completion messages
grep "textDocument/completion" trace.log > completions.log

# Find slow responses (>100ms)
grep -E "in [0-9]{3,}ms" trace.log
```

### Creating Test Cases
Save interesting message sequences for testing:
1. Capture the trace during a bug reproduction
2. Extract relevant messages
3. Create unit tests that simulate the same sequence

## Best Practices

1. **Development**: Always use "verbose" tracing during development
2. **Testing**: Save trace logs for bug reports
3. **Production**: Set tracing to "off" for performance
4. **Documentation**: Include trace snippets when reporting issues
5. **Privacy**: Remove sensitive data before sharing logs

## Resources

- [LSP Specification](https://microsoft.github.io/language-server-protocol/)
- [LSP Inspector](https://microsoft.github.io/language-server-protocol/inspector/)
- [VS Code LSP Guide](https://code.visualstudio.com/api/language-extensions/language-server-extension-guide)
- [LSP Inspector Source](https://github.com/microsoft/language-server-protocol-inspector)