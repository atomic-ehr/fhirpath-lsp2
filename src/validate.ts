import { Connection, DiagnosticSeverity } from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import { analyze, FHIRModelProvider } from "@atomic-ehr/fhirpath";

// Validation function using FHIRPath analyzer with R4 model provider
export async function validateDocument(
  connection: Connection,
  textDocument: TextDocument,
  modelProvider: FHIRModelProvider
): Promise<void> {
  const text = textDocument.getText();
  
  try {
    
    // Analyze the FHIRPath expression with error recovery enabled and R4 model provider
    const analysisResult = await analyze(text, {
      errorRecovery: true, // Enable error recovery for LSP mode
      modelProvider: modelProvider, // Use R4 model provider for type checking
    });
    
    // Convert FHIRPath diagnostics to LSP diagnostics
    const diagnostics = analysisResult.diagnostics.map(diagnostic => ({
      severity: diagnostic.severity as DiagnosticSeverity,
      range: {
        start: {
          line: diagnostic.range?.start.line ?? 0,
          character: diagnostic.range?.start.character ?? 0,
        },
        end: {
          line: diagnostic.range?.end.line ?? 0,
          character: diagnostic.range?.end.character ?? text.length,
        },
      },
      message: diagnostic.message,
      source: "fhirpath-lsp",
      code: diagnostic.code,
    }));
    
    // Send diagnostics to the client
    // Check if connection is still active before sending diagnostics
    if (connection) {
      try {
        connection.sendDiagnostics({ 
          uri: textDocument.uri, 
          diagnostics 
        });
      } catch (error) {
        // Connection might be disposed, silently ignore
        console.error("Failed to send diagnostics:", error);
      }
    }
  } catch (error) {
    // If analyze throws an error, send it as a diagnostic
    const errorMessage = error instanceof Error ? error.message : String(error);
    const diagnostics = [{
      severity: DiagnosticSeverity.Error,
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: text.length },
      },
      message: `FHIRPath analysis error: ${errorMessage}`,
      source: "fhirpath-lsp",
    }];
    
    // Check if connection is still active before sending diagnostics
    if (connection) {
      try {
        connection.sendDiagnostics({ 
          uri: textDocument.uri, 
          diagnostics 
        });
      } catch (error) {
        // Connection might be disposed, silently ignore
        console.error("Failed to send diagnostics:", error);
      }
    }
  }
}