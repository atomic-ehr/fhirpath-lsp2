import { Connection } from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import { analyze, FHIRModelProvider } from "@atomic-ehr/fhirpath";

// Create and initialize the R4 model provider
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
        console.error('Failed to initialize FHIR model provider:', error);
        // Continue without model provider if initialization fails
      });
    }
    
    await modelProviderInitPromise;
  }
  
  return modelProvider;
}

// Validation function using FHIRPath analyzer with R4 model provider
export async function validateDocument(
  connection: Connection,
  textDocument: TextDocument,
): Promise<void> {
  const text = textDocument.getText();
  
  try {
    // Get the initialized model provider
    const modelProvider = await getModelProvider();
    
    // Analyze the FHIRPath expression with error recovery enabled and R4 model provider
    const analysisResult = analyze(text, {
      errorRecovery: true, // Enable error recovery for LSP mode
      modelProvider: modelProvider, // Use R4 model provider for type checking
    });
    
    // Convert FHIRPath diagnostics to LSP diagnostics
    const diagnostics = analysisResult.diagnostics.map(diagnostic => ({
      severity: diagnostic.severity,
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
      severity: 1, // Error
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