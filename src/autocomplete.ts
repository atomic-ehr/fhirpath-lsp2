import {
  CompletionItem,
  CompletionItemKind,
  CompletionParams,
  Connection,
} from "vscode-languageserver";
import { TextDocuments } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import {
  FHIRModelProvider,
  provideCompletions,
  CompletionKind,
  type CompletionItem as FHIRPathCompletionItem,
  type CompletionOptions,
} from "@atomic-ehr/fhirpath";

// Map FHIRPath CompletionKind to LSP CompletionItemKind
function mapCompletionKind(kind: CompletionKind): CompletionItemKind {
  switch (kind) {
    case CompletionKind.Property:
      return CompletionItemKind.Property;
    case CompletionKind.Function:
      return CompletionItemKind.Function;
    case CompletionKind.Variable:
      return CompletionItemKind.Variable;
    case CompletionKind.Operator:
      return CompletionItemKind.Operator;
    case CompletionKind.Type:
      return CompletionItemKind.Class;
    case CompletionKind.Keyword:
      return CompletionItemKind.Keyword;
    case CompletionKind.Constant:
      return CompletionItemKind.Constant;
    default:
      return CompletionItemKind.Text;
  }
}

export function setupCompletionHandler(
  connection: Connection,
  documents: TextDocuments<TextDocument>,
  getModelProvider: () => Promise<FHIRModelProvider>,
): void {
  connection.onCompletion(
    async (params: CompletionParams): Promise<CompletionItem[]> => {
      connection.console.log(
        `[Server] Completion requested at ${params.position.line}:${params.position.character}`,
      );

      // Get the document
      const document = documents.get(params.textDocument.uri);
      if (!document) {
        connection.console.log(`[Server] Document not found: ${params.textDocument.uri}`);
        return [];
      }

      // Get the model provider for type information
      const modelProvider = await getModelProvider();

      // Get the text and cursor position
      const text = document.getText();
      const offset = document.offsetAt(params.position);

      // Log trigger context for debugging
      const triggerChar = params.context?.triggerCharacter;
      const triggerKind = params.context?.triggerKind;

      // Log what's at and before the cursor position
      const charAtOffset = text[offset] || "EOF";
      const charBeforeOffset = offset > 0 ? text[offset - 1] : "BOF";
      const snippet = text.substring(
        Math.max(0, offset - 10),
        Math.min(text.length, offset + 10),
      );
      
      connection.console.log(
        `[Server] Context: trigger=${triggerKind}/${triggerChar}, before='${charBeforeOffset}', at='${charAtOffset}', snippet='${snippet}'`,
      );

      // Prepare completion options
      const completionOptions: CompletionOptions = {
        modelProvider: modelProvider as any, // Cast to any to avoid type mismatch
        maxCompletions: 100,
        // You can add inputType here if you know the context type
        // inputType: { type: 'Patient', singleton: true }
      };

      // Log exactly what we're passing to provideCompletions
      const textSnippet = text.length > 50 ? 
        text.substring(0, 30) + '...' + text.substring(text.length - 10) : 
        text;
      connection.console.log(
        `[Server] Calling provideCompletions:`,
      );
      connection.console.log(
        `[Server]   - text: "${textSnippet}" (length=${text.length})`,
      );
      connection.console.log(
        `[Server]   - offset: ${offset}`,
      );
      connection.console.log(
        `[Server]   - text at offset-1: "${offset > 0 ? text[offset-1] : 'N/A'}"`,
      );
      connection.console.log(
        `[Server]   - text.substring(0, offset): "${text.substring(0, offset)}"`,
      );

      // Use the real FHIRPath completion provider
      try {
        const fhirpathCompletions: FHIRPathCompletionItem[] =
          await provideCompletions(text, offset, completionOptions);

        connection.console.log(
          `[Server] FHIRPath provider returned ${fhirpathCompletions.length} completions`,
        );

        // Log first few completions for debugging
        if (fhirpathCompletions.length > 0) {
          const preview = fhirpathCompletions
            .slice(0, 3)
            .map((c) => c.label)
            .join(", ");
          connection.console.log(
            `[Server] First completions: ${preview}${fhirpathCompletions.length > 3 ? "..." : ""}`,
          );
        }

        // Convert FHIRPath completions to LSP completions
        const lspCompletions: CompletionItem[] = fhirpathCompletions.map(
          (item) => ({
            label: item.label,
            kind: mapCompletionKind(item.kind),
            detail: item.detail,
            documentation: item.documentation,
            insertText: item.insertText || item.label,
            sortText: item.sortText,
          }),
        );

        connection.console.log(
          `[Server] Returning ${lspCompletions.length} LSP completions`,
        );
        
        // Print completions grouped by kind
        const byKind: Record<string, string[]> = {};
        lspCompletions.forEach(item => {
          const kindName = Object.keys(CompletionItemKind).find(
            key => CompletionItemKind[key as keyof typeof CompletionItemKind] === item.kind
          ) || 'Unknown';
          
          if (!byKind[kindName]) {
            byKind[kindName] = [];
          }
          byKind[kindName].push(item.label);
        });
        
        // Log completions by kind
        Object.entries(byKind).forEach(([kind, items]) => {
          if (items.length <= 15) {
            connection.console.log(`[Server]   ${kind} (${items.length}): ${items.join(', ')}`);
          } else {
            connection.console.log(`[Server]   ${kind} (${items.length}): ${items.slice(0, 10).join(', ')}...`);
          }
        });

        return lspCompletions;
      } catch (error) {
        connection.console.log(`[Server] Error getting completions: ${error}`);
        return [];
      }
    },
  );

  // Implement completion item resolve for additional details
  connection.onCompletionResolve(
    async (item: CompletionItem): Promise<CompletionItem> => {
      connection.console.log(`[Server] Completion resolve for: ${item.label}`);

      // If we need to fetch more detailed documentation from the model provider
      // we could do it here. For now, just return the item as-is.
      return item;
    },
  );
}
