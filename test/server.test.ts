import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { LSPTestClient } from "./lsp-test-client";
import * as path from "path";

describe("LSP Server - Document Validation", () => {
  let client: LSPTestClient;

  beforeAll(async () => {
    client = new LSPTestClient("bun", [
      path.join(__dirname, "../src/server.ts"),
      "--stdio",
    ]);
    
    // Initialize the server
    await client.request("initialize", {
      processId: process.pid,
      rootUri: "file:///tmp",
      capabilities: {},
    });
    
    client.notify("initialized");
  });

  afterAll(async () => {
    await client.close();
  });

  test("should send constant diagnostics for any document", async () => {
    const uri = "file:///tmp/test-validation.fhirpath";
    
    // Open any document
    client.notify("textDocument/didOpen", {
      textDocument: {
        uri,
        languageId: "fhirpath",
        version: 1,
        text: 'Patient.name.given',
      },
    });

    // Wait for diagnostics
    const diagnostics = await client.waitForDiagnostics();
    
    expect(diagnostics).not.toBeNull();
    expect(diagnostics.uri).toBe(uri);
    expect(diagnostics.diagnostics).toBeDefined();
    expect(diagnostics.diagnostics.length).toBe(2);
    
    // Check first diagnostic (error)
    const firstDiagnostic = diagnostics.diagnostics[0];
    expect(firstDiagnostic.message).toBe("Test error diagnostic");
    expect(firstDiagnostic.severity).toBe(1); // Error
    expect(firstDiagnostic.source).toBe("fhirpath-lsp");
    expect(firstDiagnostic.range.start.line).toBe(0);
    expect(firstDiagnostic.range.start.character).toBe(0);
    
    // Check second diagnostic (warning)
    const secondDiagnostic = diagnostics.diagnostics[1];
    expect(secondDiagnostic.message).toBe("Test warning diagnostic");
    expect(secondDiagnostic.severity).toBe(2); // Warning
    expect(secondDiagnostic.source).toBe("fhirpath-lsp");
    expect(secondDiagnostic.range.start.line).toBe(1);
  });
});
