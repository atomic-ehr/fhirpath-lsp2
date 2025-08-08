# Autocompletion in LSP and VSCode

## Overview

Autocompletion (also known as IntelliSense in VSCode) is a core feature of modern code editors that provides context-aware suggestions as you type. This document explains how autocompletion works in the Language Server Protocol (LSP) and its implementation in VSCode, specifically for the FHIRPath language server.

## Table of Contents

1. [How LSP Autocompletion Works](#how-lsp-autocompletion-works)
2. [VSCode Integration](#vscode-integration)
3. [Current Implementation](#current-implementation)
4. [Technical Details](#technical-details)
5. [Best Practices](#best-practices)
6. [Improvement Roadmap](#improvement-roadmap)

## How LSP Autocompletion Works

### The Request-Response Flow

1. **Capability Declaration**: During initialization, the server declares its completion capabilities:
   ```typescript
   completionProvider: {
     resolveProvider: true,              // Server can provide additional details later
     triggerCharacters: [".", "(", "["]  // Characters that automatically trigger completion
   }
   ```

2. **Triggering Completion**: Completion can be triggered in several ways:
   - **Automatic**: When typing one of the declared trigger characters
   - **Manual**: When pressing `Ctrl+Space` (Windows/Linux) or `Cmd+Space` (Mac)
   - **As-you-type**: Based on editor settings for automatic suggestions

3. **The Completion Request**: When triggered, VSCode sends a `textDocument/completion` request containing:
   ```typescript
   {
     textDocument: { uri: "file:///path/to/file.fhirpath" },
     position: { line: 10, character: 25 },
     context: {
       triggerKind: 1,  // Invoked=1, TriggerCharacter=2, TriggerForIncompleteCompletions=3
       triggerCharacter: "."  // If triggered by a character
     }
   }
   ```

4. **Server Response**: The server responds with an array of `CompletionItem` objects:
   ```typescript
   [
     {
       label: "Patient",
       kind: CompletionItemKind.Class,
       detail: "FHIR Patient Resource",
       documentation: "Demographics and administrative information...",
       insertText: "Patient",
       sortText: "001_Patient",
       filterText: "Patient"
     }
   ]
   ```

### Two-Stage Completion

When `resolveProvider: true` is set, completion happens in two stages:

1. **Initial Response**: Server quickly returns basic completion items with minimal information
2. **Resolution**: When user hovers over an item, VSCode sends `completionItem/resolve` request
3. **Detailed Response**: Server returns the same item with full documentation and details

This approach improves performance by deferring expensive operations until needed.

## VSCode Integration

### Trigger Mechanisms

VSCode triggers completion based on several factors:

1. **Trigger Characters**: Characters defined in server capabilities (`.`, `(`, `[`)
2. **Word Triggers**: After typing any word character (configurable)
3. **Manual Invocation**: Keyboard shortcut (`Ctrl/Cmd+Space`)
4. **Incomplete Completions**: Re-triggering when previous completion was incomplete

### Editor Settings

Key VSCode settings that affect completion behavior:

```json
{
  // Controls if suggestions should automatically show up while typing
  "editor.quickSuggestions": {
    "other": true,
    "comments": false,
    "strings": true
  },

  // Controls if suggestions should be accepted on commit characters
  "editor.acceptSuggestionOnCommitCharacter": true,

  // Controls if suggestions should show up on trigger characters
  "editor.suggestOnTriggerCharacters": true,

  // Controls the delay in ms after which quick suggestions will show up
  "editor.quickSuggestionsDelay": 10,

  // Controls if pressing tab inserts the best suggestion
  "editor.tabCompletion": "on",

  // Controls how suggestions are pre-selected
  "editor.suggestSelection": "first",

  // Controls if word based suggestions should be included
  "editor.wordBasedSuggestions": true
}
```

### Completion Item Presentation

VSCode displays completion items with:
- **Icon**: Based on `kind` property (function, class, field, etc.)
- **Label**: Primary text shown in the list
- **Detail**: Additional text shown to the right
- **Documentation**: Shown in a side panel when item is selected

## Current Implementation

### Server Configuration (server.ts:49-52)

```typescript
completionProvider: {
  resolveProvider: true,
  triggerCharacters: [".", "(", "["],
}
```

This configuration:
- Enables completion with resolve support
- Triggers on dot notation, function calls, and array/filter access

### Completion Handler (server.ts:107-147)

The current implementation returns static completion items:

```typescript
connection.onCompletion((params) => {
  // Log the request
  connection.console.log(
    `[Server] Completion requested at ${params.position.line}:${params.position.character}`,
  );

  // Return static list of completions
  return [
    {
      label: "Patient",
      kind: 7, // CompletionItemKind.Class
      detail: "FHIR Patient Resource",
      documentation: "Demographics and other administrative information..."
    },
    // ... more static items
  ];
});
```

### Current Limitations

1. **No Context Awareness**: Always returns the same completions regardless of cursor position
2. **Static List**: Doesn't analyze the current expression or document
3. **No Type Information**: Doesn't use FHIR model to provide type-specific completions
4. **No Snippets**: Doesn't provide function snippets with placeholders
5. **No Resolution**: Doesn't implement `completionItem/resolve` despite declaring support

## Technical Details

### CompletionItem Structure

A complete `CompletionItem` can include:

```typescript
interface CompletionItem {
  // Required
  label: string;                    // Text shown in completion list

  // Display and behavior
  kind?: CompletionItemKind;        // Icon type (1-25)
  detail?: string;                  // Additional info shown inline
  documentation?: string | MarkupContent;  // Full description
  deprecated?: boolean;             // Strike-through if deprecated
  preselect?: boolean;              // Select this item by default

  // Text insertion
  insertText?: string;              // Text to insert (defaults to label)
  insertTextFormat?: InsertTextFormat;  // Plain text or snippet
  insertTextMode?: InsertTextMode;  // How to insert (replace or insert)
  textEdit?: TextEdit;              // Edit to apply when selected
  additionalTextEdits?: TextEdit[]; // Additional edits (e.g., imports)

  // Filtering and sorting
  sortText?: string;                // Sort order (defaults to label)
  filterText?: string;              // Filter text (defaults to label)

  // Behavior
  commitCharacters?: string[];      // Characters that accept this item
  command?: Command;                // Command to execute after insertion

  // For resolve
  data?: any;                       // Preserved between completion and resolve
}
```

### CompletionItemKind Values

Common kinds and their icons in VSCode:

```typescript
enum CompletionItemKind {
  Text = 1,           // 'abc' icon
  Method = 2,         // Box with 'M'
  Function = 3,       // Box with 'ƒ'
  Constructor = 4,    // Box with 'C'
  Field = 5,          // Box with dots
  Variable = 6,       // Box with 'V'
  Class = 7,          // Box with 'C' (different style)
  Interface = 8,      // Box with 'I'
  Module = 9,         // Box with '{}'
  Property = 10,      // Box with wrench
  Unit = 11,          // Ruler icon
  Value = 12,         // Box with '<>'
  Enum = 13,          // Box with 'E'
  Keyword = 14,       // Box with key
  Snippet = 15,       // Box with '<>'
  Color = 16,         // Color square
  File = 17,          // Document icon
  Reference = 18,     // Book icon
  Folder = 19,        // Folder icon
  // ... up to 25
}
```

### Snippet Syntax

When `insertTextFormat` is set to `InsertTextFormat.Snippet`, you can use snippet syntax:

```typescript
{
  label: "where",
  insertText: "where(${1:condition})",
  insertTextFormat: InsertTextFormat.Snippet,
  documentation: "Filter collection by condition"
}
```

Snippet placeholders:
- `${1:placeholder}`: Numbered placeholder with default text
- `${1}`: Numbered placeholder without default
- `${0}`: Final cursor position
- `${1|option1,option2|}`: Choice placeholder

## Best Practices

### Performance Optimization

1. **Quick Initial Response**: Return basic items quickly, defer expensive operations
2. **Limit Results**: Don't return hundreds of items (VSCode limits display anyway)
3. **Use Resolve**: Implement two-stage completion for documentation/details
4. **Cache Results**: Cache type information and common completions
5. **Cancel Support**: Honor cancellation tokens for long-running operations

### User Experience

1. **Relevant Suggestions**: Filter based on context and current input
2. **Smart Sorting**: Use `sortText` to prioritize common/relevant items
3. **Clear Labels**: Use concise, descriptive labels
4. **Helpful Documentation**: Provide examples in documentation
5. **Snippets for Functions**: Include parameter placeholders for functions

### Context Analysis

To provide intelligent completions:

1. **Parse Current Expression**: Understand the FHIRPath expression structure
2. **Determine Context**: Identify if cursor is after dot, in function, etc.
3. **Type Resolution**: Determine the type at cursor position
4. **Scope Analysis**: Consider available variables and functions
5. **Filter Appropriately**: Only show valid completions for context

## Client-Side Caching and Filtering

### Overview

Modern code editors like CodeMirror support client-side caching of autocomplete results, reducing server requests and improving responsiveness. This is particularly valuable for LSP implementations where network latency can impact user experience.

### How Caching Works in CodeMirror

CodeMirror's autocomplete system includes a `validFor` property that determines when cached results can be reused:

```javascript
// Return completion result with caching
return {
  from: match.from,
  to: match.to,
  options: completions,
  validFor: /^\w*$/  // Reuse cache while typing word characters
};
```

When `validFor` is provided:
1. CodeMirror caches the completion results
2. As the user types, it checks if the new input matches the `validFor` pattern
3. If it matches, cached results are filtered client-side
4. If it doesn't match, a new server request is made

### Implementation Patterns

#### Basic Word Completion Caching

Cache completions and filter while typing word characters:

```javascript
private getLSPCompletions(cm: any, callback: any): any {
  const cursor = cm.getCursor();
  const token = cm.getTokenAt(cursor);
  
  // Request completions from LSP
  return this.sendRequest("textDocument/completion", {
    textDocument: { uri: this.documentUri },
    position: { line: cursor.line, character: cursor.ch }
  }).then(response => {
    const completions = this.processCompletions(response);
    
    return {
      list: completions,
      from: { line: cursor.line, ch: token.start },
      to: { line: cursor.line, ch: token.end },
      // Cache and filter while typing word characters
      validFor: /^\w*$/
    };
  });
}
```

#### FHIRPath-Specific Caching

For FHIRPath expressions, cache after dots and filter during property/method typing:

```javascript
// Cache after dot notation, filter while typing properties
validFor: /^\.?\w*$/

// Cache for entire member access chains
validFor: /^[\w.]*$/

// More sophisticated: cache based on trigger context
const getTriggerContext = (text: string, pos: number) => {
  const beforeCursor = text.slice(Math.max(0, pos - 50), pos);
  
  if (beforeCursor.endsWith('.')) {
    // Just typed a dot - cache all properties
    return {
      validFor: /^\.\w*$/,  // Keep using cache after the dot
      cacheKey: 'afterDot'
    };
  } else if (beforeCursor.match(/\w+$/)) {
    // Typing a word - use cached results if available
    return {
      validFor: /^\w+$/,
      cacheKey: 'word'
    };
  }
};
```

#### Context-Aware Caching Strategy

Implement intelligent caching based on expression context:

```javascript
private async getLSPCompletions(context: CompletionContext) {
  const match = context.matchBefore(/[\w.]*$/);
  if (!match) return null;
  
  const text = context.state.doc.toString();
  const beforeMatch = text.slice(Math.max(0, match.from - 1), match.from);
  
  // Determine caching strategy based on context
  let validFor: RegExp | undefined;
  let requestBroaderContext = false;
  
  if (beforeMatch.endsWith('.')) {
    // After dot: cache all properties, filter as user types
    validFor = /^\.?\w*$/;
    requestBroaderContext = true;  // Request all possible completions
  } else if (beforeMatch.match(/\w+\.$/)) {
    // After property access: cache method/property chain
    validFor = /^[\w.]*$/;
  } else {
    // General context: cache word completions
    validFor = /^\w*$/;
  }
  
  const completions = await this.requestCompletions(
    context.pos, 
    requestBroaderContext
  );
  
  return {
    from: match.from,
    options: completions,
    validFor: validFor  // Enable client-side filtering
  };
}
```

### Advanced Caching Techniques

#### 1. **Custom Validation Functions**

Instead of regex, use a function for complex validation logic:

```javascript
validFor: (text, from, to, state) => {
  // Custom logic to determine if cache is still valid
  const typed = text.slice(from, to);
  
  // Keep cache if still typing the same expression
  if (typed.match(/^[\w.]*$/)) {
    return true;
  }
  
  // Invalidate if user types space, parenthesis, etc.
  return false;
}
```

#### 2. **Multi-Level Caching**

Implement different cache levels for different contexts:

```javascript
class CompletionCache {
  private cache = new Map<string, CompletionResult>();
  
  getCacheKey(context: CompletionContext): string {
    // Generate cache key based on context
    const beforeCursor = context.state.doc.sliceString(0, context.pos);
    const lastDot = beforeCursor.lastIndexOf('.');
    
    if (lastDot >= 0) {
      // Cache based on the expression before the dot
      return beforeCursor.slice(0, lastDot);
    }
    
    return 'global';  // Global completions
  }
  
  async getCompletions(context: CompletionContext) {
    const cacheKey = this.getCacheKey(context);
    
    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey)!;
      // Return cached result with appropriate validFor
      return { ...cached, validFor: /^\w*$/ };
    }
    
    // Fetch and cache
    const result = await this.fetchCompletions(context);
    this.cache.set(cacheKey, result);
    return result;
  }
}
```

#### 3. **Intelligent Prefetching**

Request broader context to maximize cache utility:

```javascript
private async requestCompletions(pos: number, requestAll: boolean = false) {
  const request = {
    textDocument: { uri: this.documentUri },
    position: this.offsetToPosition(pos),
    context: {
      triggerKind: 2,
      // Request all possible completions if caching
      limit: requestAll ? 1000 : 100
    }
  };
  
  const response = await this.sendRequest("textDocument/completion", request);
  
  // Process and return all completions for client-side filtering
  return this.processAllCompletions(response);
}
```

### Benefits of Client-Side Caching

1. **Reduced Latency**: Instant filtering without network round-trips
2. **Lower Server Load**: Fewer completion requests to the LSP server
3. **Better UX**: Smoother, more responsive autocomplete experience
4. **Offline Capability**: Cached completions work even with connection issues
5. **Predictable Behavior**: Consistent filtering regardless of network speed

### Best Practices for Caching

1. **Cache Strategically**: Cache after trigger characters (`.`, `(`, `[`)
2. **Invalidate Appropriately**: Clear cache when context changes significantly
3. **Memory Management**: Limit cache size to prevent memory issues
4. **Request Optimization**: Request broader context when caching is enabled
5. **Fallback Handling**: Gracefully handle cache misses and fetch new data

### Integration with LSP

When implementing caching with LSP:

1. **Server-Side Support**: Ensure server can handle requests for broader context
2. **Completion Resolve**: Use two-stage completion for detailed information
3. **Incremental Updates**: Support incremental completion for large result sets
4. **Capability Negotiation**: Declare caching support in client capabilities

Example LSP integration:

```javascript
// In client initialization
capabilities: {
  textDocument: {
    completion: {
      contextSupport: true,
      dynamicRegistration: true,
      // Indicate client handles filtering
      completionItem: {
        snippetSupport: true,
        filterSupport: true  // Custom capability
      }
    }
  }
}

// Server can then optimize responses
if (params.context?.filterSupport) {
  // Return all completions without filtering
  return getAllCompletionsForContext(params);
} else {
  // Return filtered completions
  return getFilteredCompletions(params);
}
```

## Improvement Roadmap

### Phase 1: Context-Aware Completion

Implement basic context awareness:

```typescript
connection.onCompletion(async (params) => {
  const document = documents.get(params.textDocument.uri);
  if (!document) return null;

  const text = document.getText();
  const offset = document.offsetAt(params.position);

  // Get text before cursor
  const textBeforeCursor = text.substring(0, offset);

  // Determine context
  const context = analyzeContext(textBeforeCursor);

  switch (context.type) {
    case 'start':
      return getFHIRResourceCompletions();
    case 'afterDot':
      return getPropertyCompletions(context.parentType);
    case 'inFunction':
      return getFunctionParameterCompletions(context.functionName);
    default:
      return getAllCompletions();
  }
});
```

### Phase 2: FHIR Model Integration

Integrate with the existing FHIR model provider:

```typescript
import { FHIRModelProvider } from "@atomic-ehr/fhirpath";

async function getPropertyCompletions(typeName: string) {
  const modelProvider = await getModelProvider();
  const typeDefinition = await modelProvider.getTypeDefinition(typeName);

  return typeDefinition.properties.map(prop => ({
    label: prop.name,
    kind: CompletionItemKind.Property,
    detail: `${prop.type}${prop.isArray ? '[]' : ''}`,
    documentation: prop.documentation,
    insertText: prop.name
  }));
}
```

### Phase 3: Advanced Features

1. **AST-Based Analysis**: Use FHIRPath parser for accurate context
2. **Type Inference**: Track types through expression chain
3. **Variable Tracking**: Remember defined variables in scope
4. **Smart Snippets**: Context-aware snippet generation
5. **Auto-imports**: Add necessary imports/references

### Phase 4: Intelligence Enhancements

1. **Machine Learning**: Learn from user patterns
2. **Frequency Analysis**: Prioritize commonly used items
3. **Project Analysis**: Scan project for custom patterns
4. **Documentation Links**: Link to FHIR specification
5. **Example Generation**: Show usage examples

### Implementation Example

Here's how an improved completion handler might look:

```typescript
connection.onCompletion(async (params) => {
  const document = documents.get(params.textDocument.uri);
  if (!document) return null;

  // Parse the FHIRPath expression
  const text = document.getText();
  const ast = parseFHIRPath(text, { errorRecovery: true });

  // Find node at cursor position
  const position = params.position;
  const node = findNodeAtPosition(ast, position);

  // Determine context from AST
  const context = analyzeASTContext(node);

  // Get type information
  const modelProvider = await getModelProvider();
  const currentType = await resolveType(context, modelProvider);

  // Generate completions based on context and type
  const completions = await generateCompletions({
    context,
    currentType,
    modelProvider,
    triggerCharacter: params.context?.triggerCharacter
  });

  // Sort and filter
  return filterAndSort(completions, text, position);
});
```

## Testing Autocompletion

### Manual Testing

1. Open debug client (`bun run debug`)
2. Type various FHIRPath expressions
3. Test trigger characters (`.`, `(`, `[`)
4. Test manual trigger (`Ctrl/Cmd+Space`)
5. Verify completion items appear correctly

### Automated Testing

```typescript
test("should provide resource completions at start", async () => {
  const completions = await client.request("textDocument/completion", {
    textDocument: { uri: "test.fhirpath" },
    position: { line: 0, character: 0 }
  });

  expect(completions).toContainEqual(
    expect.objectContaining({ label: "Patient" })
  );
});

test("should provide property completions after dot", async () => {
  // Open document with "Patient."
  await client.notify("textDocument/didOpen", {
    textDocument: {
      uri: "test.fhirpath",
      text: "Patient.",
      version: 1
    }
  });

  const completions = await client.request("textDocument/completion", {
    textDocument: { uri: "test.fhirpath" },
    position: { line: 0, character: 8 }
  });

  expect(completions).toContainEqual(
    expect.objectContaining({ label: "name" })
  );
});
```

## Conclusion

Autocompletion is a complex feature that requires careful implementation to provide a good user experience. The current implementation provides basic static completions, but there's significant room for improvement through context awareness, FHIR model integration, and intelligent filtering. The roadmap outlined above provides a path toward a sophisticated, helpful completion system for FHIRPath expressions.
