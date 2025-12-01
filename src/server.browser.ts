#!/usr/bin/env bun
import {
  createConnection,
  BrowserMessageReader,
  BrowserMessageWriter,
  Connection,
} from "vscode-languageserver/browser";
import { FHIRModelProvider, type Options } from "@atomic-ehr/fhirpath";
import { setupConnectionCommon } from "./server.common";

// Server options interface
export type ServerOptions = {
  port: MessagePort;
} & Options;

// Setup connection with all handlers
export async function setupConnection(
  connection: Connection,
  options: ServerOptions,
): Promise<void> {

  return await setupConnectionCommon(
    connection,
    () => {
      return new FHIRModelProvider(options)
    },
    undefined
  )
}

// Start server with specified transport
function startServer(options: ServerOptions): void {
  const channel = new MessageChannel();

  const connection = createConnection(
    new BrowserMessageReader(options.port),
    new BrowserMessageWriter(options.port),
  );

  setupConnection(connection, options);
}

export { startServer };
