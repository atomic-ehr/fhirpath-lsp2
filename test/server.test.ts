import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { LSPTestClient } from "./lsp-test-client";
import * as path from "path";

describe("LSP Server - Document Validation", () => {
  let client: LSPTestClient;

  beforeAll(async () => {
    client = new LSPTestClient("bun", [
      path.join(__dirname, "../src/server.node.ts"),
      "--stdio",
    ]);
    
    // Initialize the server
    await client.request("initialize", {
      processId: process.pid,
      rootUri: "file:///tmp",
      capabilities: {},
    });
    
    client.notify("initialized");
    
    // Wait a bit for model provider to initialize
    await new Promise(resolve => setTimeout(resolve, 2000));
  });

  afterAll(async () => {
    await client.close();
  });

  test("should validate valid FHIRPath without errors", async () => {
    const uri = "file:///tmp/test-validation.fhirpath";
    
    // Open a document with valid FHIRPath
    client.notify("textDocument/didOpen", {
      textDocument: {
        uri,
        languageId: "fhirpath",
        version: 1,
        text: 'Patient.name.given',
      },
    });

    // Wait for diagnostics
    const diagnostics = await client.waitForDiagnostics(uri);

    expect(diagnostics).not.toBeNull();
    expect(diagnostics.uri).toBe(uri);
    expect(diagnostics.diagnostics).toBeDefined();
    // Valid expression should have no errors
    expect(diagnostics.diagnostics.length).toBe(0);
  });

  test("should report errors for invalid FHIRPath syntax", async () => {
    const uri = "file:///tmp/test-error.fhirpath";

    // Open a document with invalid FHIRPath syntax
    client.notify("textDocument/didOpen", {
      textDocument: {
        uri,
        languageId: "fhirpath",
        version: 1,
        text: 'Patient...',  // Invalid syntax with multiple dots
      },
    });

    // Wait for diagnostics
    const diagnostics = await client.waitForDiagnostics(uri);
    
    expect(diagnostics).not.toBeNull();
    expect(diagnostics.uri).toBe(uri);
    expect(diagnostics.diagnostics).toBeDefined();
    // Should have at least one error for syntax error
    expect(diagnostics.diagnostics.length).toBeGreaterThan(0);
    
    // Check that we have an error diagnostic
    const errorDiagnostic = diagnostics.diagnostics.find(d => d.severity === 1);
    expect(errorDiagnostic).toBeDefined();
    expect(errorDiagnostic.source).toBe("fhirpath-lsp");
  });
});
