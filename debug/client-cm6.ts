// Import CodeMirror 6 modules
import { EditorState, StateEffect, StateField } from "@codemirror/state";
import {
  EditorView,
  keymap,
  ViewUpdate,
  Decoration,
  type DecorationSet,
  tooltips,
} from "@codemirror/view";
import { basicSetup } from "codemirror";
import {
  autocompletion,
  CompletionContext,
  type CompletionResult,
  acceptCompletion,
  completionKeymap,
  startCompletion,
} from "@codemirror/autocomplete";
import {
  syntaxHighlighting,
  defaultHighlightStyle,
} from "@codemirror/language";
import { linter, type Diagnostic } from "@codemirror/lint";
import { oneDark } from "@codemirror/theme-one-dark";

// LSP Client for WebSocket connection
export class LSPClient {
  private ws: WebSocket | null = null;
  private messageId = 0;
  private documentUri = "file:///debug/test.fhirpath";
  private documentVersion = 0;
  private responseHandlers = new Map<number, (response: any) => void>();
  private messageHistory: Array<{
    id: string;
    type: "send" | "receive";
    method?: string;
    timestamp: Date;
    data: any;
  }> = [];
  private editorView: EditorView | null = null;
  private currentDiagnostics: any[] = [];
  private debounceTimer: number | undefined;

  constructor() {
    this.initializeEditor();
  }

  private initializeEditor(): void {
    const editorElement = document.getElementById("editor");
    if (!editorElement) return;

    const initialText = `Patient
  .name
  .where( use = 'official' )
  .first()`;

    // Create LSP completion source with intelligent caching
    const lspCompletionSource = async (
      context: CompletionContext,
    ): Promise<CompletionResult | null> => {
      console.log(`[Completion] Source called at position ${context.pos}`);

      // Get the text and check what's before cursor
      const text = context.state.doc.toString();
      const beforeCursor = text.slice(
        Math.max(0, context.pos - 1),
        context.pos,
      );
      const justTypedDot = beforeCursor === ".";

      // Log context for debugging cache invalidation
      const textBeforeCursor = text.slice(
        Math.max(0, context.pos - 20),
        context.pos,
      );
      console.log(
        `[Completion] Text before cursor: "${textBeforeCursor}", Just typed dot: ${justTypedDot}`,
      );

      // Check for different patterns
      const dotMatch = context.matchBefore(/\.\w*/);
      const wordMatch = context.matchBefore(/\w+/);
      const fullMatch = context.matchBefore(/\w+\.?/);
      const parenMatch = context.matchBefore(/\(\s*\w*/); // Match '(' followed by optional space and word chars

      // Check if we're after an opening parenthesis
      const afterParen =
        beforeCursor === "(" ||
        (context.pos > 1 && text.slice(context.pos - 2, context.pos) === "( ");

      // Log what we found
      console.log(
        `[Completion] Just typed dot: ${justTypedDot}, After paren: ${afterParen}, Dot match: "${dotMatch?.text}", Paren match: "${parenMatch?.text}", Word match: "${wordMatch?.text}", Explicit: ${context.explicit}`,
      );

      // Check if this is a cached call (filtering) vs a new request
      // A cached call happens when we're filtering existing results
      const textAfterDot = dotMatch ? dotMatch.text.substring(1) : "";
      const textAfterParen = parenMatch
        ? parenMatch.text.replace(/\(\s*/, "")
        : "";

      const isCachedCall =
        // Filtering after dot
        (dotMatch &&
          textAfterDot.length > 0 &&
          !justTypedDot &&
          /^\w+$/.test(textAfterDot)) ||
        // Filtering inside parentheses
        (parenMatch &&
          textAfterParen.length > 0 &&
          !afterParen &&
          /^\w+$/.test(textAfterParen));

      if (isCachedCall) {
        console.log(
          `[Completion] CACHED CALL - CodeMirror is filtering for "${textAfterDot || textAfterParen}"`,
        );
      } else {
        console.log(`[Completion] NEW REQUEST - Will fetch from LSP server`);
      }

      // Trigger if we just typed a dot, after parenthesis, or it's explicit
      if (
        !justTypedDot &&
        !afterParen &&
        !context.explicit &&
        !dotMatch &&
        !parenMatch
      ) {
        console.log(`[Completion] Not triggering - no completion context`);
        return null;
      }

      try {
        // Get completions from LSP if connected, otherwise use test data
        let completions: any[] = [];

        // Only request from LSP if this is not a cached/filtering call
        if (!isCachedCall) {
          if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            completions = await this.requestCompletions(
              context.pos,
              justTypedDot,
            );
            console.log(
              `[Completion] Received ${completions.length} items from LSP server`,
            );
          } else {
            console.log(
              `[Completion] No LSP connection - no completions available`,
            );
            return null;
          }
        } else {
          // This is a cached call - CodeMirror will filter the previously returned results
          console.log(
            `[Completion] Skipping LSP request - CodeMirror will filter cached results`,
          );
          return null; // Let CodeMirror use cached results
        }

        // Determine the range to replace
        let from = context.pos;

        // If we just typed a dot, we want to insert after it
        if (justTypedDot) {
          from = context.pos; // Start from current position (after the dot)
        } else if (dotMatch) {
          // We're completing after a dot, replace from the dot
          from = dotMatch.from;
        } else if (wordMatch) {
          // We're completing a word
          from = wordMatch.from;
        } else if (fullMatch) {
          from = fullMatch.from;
        }

        const result = {
          from: from,
          to: context.pos,
          options: completions.map((item) => ({
            label: item.label,
            type: this.getCompletionType(item.kind),
            detail: item.detail || item.documentation,
            apply: item.insertText || item.label,
          })),
          // Enable caching and client-side filtering
          // Cache is valid while typing word characters (letters, numbers, underscore)
          // Cache is invalidated when typing dots, spaces, operators, etc.
          validFor: /^[a-zA-Z0-9_]*$/,
        };

        console.log(
          `[Completion] Returning result from ${from} to ${context.pos} with ${result.options.length} options (cache enabled for word chars)`,
        );

        // Print completion summary
        const properties = result.options.filter((o) => o.type === "property");
        const functions = result.options.filter((o) => o.type === "function");
        const others = result.options.filter(
          (o) => o.type !== "property" && o.type !== "function",
        );

        console.log(
          `[Completion Summary] ${properties.length} properties, ${functions.length} functions, ${others.length} others`,
        );
        if (properties.length > 0 && properties.length <= 15) {
          console.log(
            `  Properties: ${properties.map((p) => p.label).join(", ")}`,
          );
        }
        if (functions.length > 0 && functions.length <= 10) {
          console.log(
            `  Functions: ${functions
              .slice(0, 10)
              .map((f) => f.label)
              .join(", ")}${functions.length > 10 ? "..." : ""}`,
          );
        }
        return result;
      } catch (error) {
        console.error("Failed to get completions:", error);
        return null;
      }
    };

    // Create linter for diagnostics
    const lspLinter = linter((view) => {
      return this.currentDiagnostics.map((d) => ({
        from: this.positionToOffset(view.state.doc.toString(), d.range.start),
        to: this.positionToOffset(view.state.doc.toString(), d.range.end),
        severity:
          d.severity === 1 ? "error" : d.severity === 2 ? "warning" : "info",
        message: d.message,
      }));
    });

    // Create editor state
    const state = EditorState.create({
      doc: initialText,
      extensions: [
        basicSetup,
        // Theme for better visibility
        EditorView.theme({
          "&": {
            fontSize: "14px",
          },
          ".cm-tooltip.cm-tooltip-autocomplete": {
            "& > ul": {
              fontFamily: "monospace",
              maxHeight: "200px",
              maxWidth: "400px",
            },
          },
        }),
        autocompletion({
          override: [lspCompletionSource],
          activateOnTyping: true,
          activateOnTypingDelay: 0, // No delay for triggers
          selectOnOpen: true, // Auto-select first item
          closeOnBlur: true, // Close on blur
          maxRenderedOptions: 100, // Max items to render
          defaultKeymap: true, // Use default keybindings
          icons: true, // Add icons for completion types
        }),
        // Add completion keymap
        keymap.of([
          ...completionKeymap,
          {
            key: "Cmd-Space",
            run: (view) => {
              // Manually trigger completion
              console.log("[Manual] Triggering completion with Cmd-Space");
              return startCompletion(view);
            },
          },
          {
            key: "Ctrl-.",
            run: (view) => {
              // Alternative trigger
              console.log("[Manual] Triggering completion with Ctrl-.");
              return startCompletion(view);
            },
          },
          {
            key: "Alt-/",
            run: (view) => {
              // Another alternative trigger
              console.log("[Manual] Triggering completion with Alt-/");
              return startCompletion(view);
            },
          },
          {
            key: "Enter",
            run: (view) => {
              // First try to accept completion, if none then insert newline
              if (acceptCompletion(view)) return true;
              // Otherwise, insert a newline
              view.dispatch(view.state.replaceSelection("\n"));
              return true;
            },
          },
        ]),
        lspLinter,
        EditorView.updateListener.of((update: ViewUpdate) => {
          if (update.docChanged) {
            // Check if user just typed a trigger character BEFORE debouncing
            const changes = update.state.doc.sliceString(0);
            const pos = update.state.selection.main.head;
            const justTypedDot = pos > 0 && changes[pos - 1] === ".";
            const justTypedParen = pos > 0 && changes[pos - 1] === "(";
            const justTypedSpace =
              pos > 1 && changes[pos - 1] === " " && changes[pos - 2] === "(";

            if (justTypedDot || justTypedParen || justTypedSpace) {
              const triggerChar = justTypedDot
                ? "."
                : justTypedParen
                  ? "("
                  : "( ";
              console.log(
                `[Editor] Detected trigger '${triggerChar}' at position ${pos}`,
              );
              // Immediately update document for trigger characters (no debounce)
              this.updateDocument();
              // Then trigger completion
              setTimeout(() => {
                console.log(
                  `[Editor] Triggering completion after '${triggerChar}'`,
                );
                startCompletion(update.view);
              }, 10);
            } else {
              // For other changes, use debounced update
              this.onEditorChange();
            }
          }
        }),
        syntaxHighlighting(defaultHighlightStyle),
      ],
    });

    // Create editor view
    this.editorView = new EditorView({
      state,
      parent: editorElement,
    });
  }

  private positionToOffset(
    text: string,
    position: { line: number; character: number },
  ): number {
    const lines = text.split("\n");
    let offset = 0;
    for (let i = 0; i < position.line && i < lines.length; i++) {
      offset += lines[i].length + 1; // +1 for newline
    }
    return offset + position.character;
  }

  private offsetToPosition(
    text: string,
    offset: number,
  ): { line: number; character: number } {
    const lines = text.split("\n");
    let currentOffset = 0;
    for (let line = 0; line < lines.length; line++) {
      const lineLength = lines[line].length + 1; // +1 for newline
      if (currentOffset + lineLength > offset) {
        return { line, character: offset - currentOffset };
      }
      currentOffset += lineLength;
    }
    return {
      line: lines.length - 1,
      character: lines[lines.length - 1].length,
    };
  }

  private async requestCompletions(
    offset: number,
    justTypedDot: boolean,
  ): Promise<any[]> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.editorView) {
      return [];
    }

    const text = this.editorView.state.doc.toString();
    const position = this.offsetToPosition(text, offset);

    // Determine trigger context
    const triggerKind = justTypedDot ? 2 : 1; // 2 = TriggerCharacter, 1 = Invoked
    const triggerCharacter = justTypedDot ? "." : undefined;

    console.log(
      `[LSP Request] Completion at position ${position.line}:${position.character}, trigger: ${triggerKind}`,
    );

    try {
      const response = await this.sendRequest("textDocument/completion", {
        textDocument: { uri: this.documentUri },
        position: position,
        context: {
          triggerKind: triggerKind,
          triggerCharacter: triggerCharacter,
        },
      });

      if (!response || !response.result) {
        console.log(`[LSP Response] No results received`);
        return [];
      }

      const items = Array.isArray(response.result)
        ? response.result
        : response.result.items || [];
      console.log(`[LSP Response] Received ${items.length} completion items`);

      // Print raw LSP completions for debugging
      console.group(`[LSP Completions] Raw items from server`);
      items.forEach((item: any, index: number) => {
        console.log(
          `  ${index + 1}. ${item.label} (kind: ${item.kind}, detail: ${item.detail || "none"})`,
        );
      });
      console.groupEnd();

      return items;
    } catch (error) {
      console.error("Failed to get completions:", error);
      return [];
    }
  }

  private getCompletionType(kind: number): string {
    switch (kind) {
      case 7:
        return "class";
      case 3:
        return "function";
      case 5:
        return "property";
      case 6:
        return "variable";
      default:
        return "text";
    }
  }

  private onEditorChange(): void {
    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.updateDocument();
    }, 500) as any;
  }

  connect(url: string = "ws://localhost:8080/lsp"): void {
    this.updateStatus("connecting", "Connecting...");

    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      console.log("WebSocket connected");
      this.updateStatus("connected", "Connected");
      this.updateButtons(true);
      this.initialize();
    };

    this.ws.onmessage = (event) => {
      const message = this.parseMessage(event.data);
      if (message) {
        this.handleMessage(message);
      }
    };

    this.ws.onerror = (error) => {
      console.error("WebSocket error:", error);
      this.addMessage({ error: "Connection failed" }, "receive");
    };

    this.ws.onclose = () => {
      console.log("WebSocket disconnected");
      this.updateStatus("disconnected", "Disconnected");
      this.updateButtons(false);
    };
  }

  disconnect(): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.shutdown().then(() => {
        setTimeout(() => {
          this.ws?.close();
        }, 100);
      });
    }
  }

  private parseMessage(data: string | ArrayBuffer): any {
    try {
      if (typeof data === "string") {
        return JSON.parse(data);
      }
    } catch (e) {
      console.error("Failed to parse message:", e);
    }
    return null;
  }

  private sendMessage(message: any): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const json = JSON.stringify(message);
      this.ws.send(json);
      this.addMessage(message, "send");
    }
  }

  private sendRequest(method: string, params?: any): Promise<any> {
    const id = ++this.messageId;
    const message = {
      jsonrpc: "2.0",
      id,
      method,
      params,
    };

    this.sendMessage(message);

    return new Promise((resolve) => {
      this.responseHandlers.set(id, resolve);
      setTimeout(() => {
        if (this.responseHandlers.has(id)) {
          this.responseHandlers.delete(id);
          resolve({ error: "Request timeout" });
        }
      }, 5000);
    });
  }

  private sendNotification(method: string, params?: any): void {
    const message = {
      jsonrpc: "2.0",
      method,
      params,
    };

    this.sendMessage(message);
  }

  private handleMessage(message: any): void {
    this.addMessage(message, "receive");

    // Handle responses
    if (message.id !== undefined && this.responseHandlers.has(message.id)) {
      const handler = this.responseHandlers.get(message.id);
      this.responseHandlers.delete(message.id);
      handler?.(message);
    }
    // Handle notifications
    else if (message.method === "textDocument/publishDiagnostics") {
      this.handleDiagnostics(message.params);
    }
  }

  private handleDiagnostics(params: any): void {
    const diagnosticsDiv = document.getElementById("diagnostics")!;
    const countSpan = document.getElementById("diagnosticCount")!;

    // Store diagnostics for the linter
    this.currentDiagnostics = params.diagnostics;

    // Update HTML display
    diagnosticsDiv.innerHTML = "";
    countSpan.textContent = params.diagnostics.length.toString();

    params.diagnostics.forEach((diagnostic: any) => {
      const div = document.createElement("div");
      const severityClass =
        diagnostic.severity === 1
          ? "diagnostic-error"
          : diagnostic.severity === 2
            ? "diagnostic-warning"
            : "diagnostic-info";

      div.className = severityClass;
      div.innerHTML = `
        <div class="text-xs opacity-75 mb-1">
          Line ${diagnostic.range.start.line + 1}:${diagnostic.range.start.character}
        </div>
        <div class="text-sm">${diagnostic.message}</div>
      `;
      diagnosticsDiv.appendChild(div);
    });

    // Force editor to re-run linter
    if (this.editorView) {
      this.editorView.dispatch({
        effects: StateEffect.appendConfig.of([]),
      });
    }
  }

  private addMessage(data: any, type: "send" | "receive"): void {
    const timestamp = new Date();
    const messageId = `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    this.messageHistory.unshift({
      id: messageId,
      type,
      method: data.method || (data.id ? `response:${data.id}` : "unknown"),
      timestamp,
      data,
    });

    if (this.messageHistory.length > 100) {
      this.messageHistory.pop();
    }

    this.renderMessages();
  }

  private renderMessages(): void {
    const messagesDiv = document.getElementById("messages")!;
    messagesDiv.innerHTML = "";

    this.messageHistory.forEach((msg) => {
      const messageEl = document.createElement("div");
      messageEl.className = `message-item message-${msg.type}`;
      messageEl.dataset.messageId = msg.id;

      const headerEl = document.createElement("div");
      headerEl.className = "message-header flex items-center justify-between";
      headerEl.innerHTML = `
        <div class="flex items-center gap-2 flex-1 px-4 border-b border-b-gray-200 py-1">
          <span class="${msg.type === "send" ? "message-type-send" : "message-type-receive"}">
            ${msg.type === "send" ? "→" : "←"}
          </span>
          <span class="text-gray-300">|</span>
          <span class="message-method flex-1">${msg.method}</span>
          <span class="text-gray-400 text-xs">${msg.timestamp.toLocaleTimeString()}</span>
        </div>
      `;

      const bodyEl = document.createElement("div");
      bodyEl.className = "message-body hidden";
      bodyEl.innerHTML = `<pre>${JSON.stringify(msg.data, null, 2)}</pre>`;

      messageEl.appendChild(headerEl);
      messageEl.appendChild(bodyEl);

      headerEl.addEventListener("click", () => {
        const body = messageEl.querySelector(".message-body")!;
        if (body.classList.contains("hidden")) {
          body.classList.remove("hidden");
        } else {
          body.classList.add("hidden");
        }
      });

      messagesDiv.appendChild(messageEl);
    });
  }

  private updateStatus(className: string, text: string): void {
    const statusEl = document.getElementById("status")!;
    statusEl.textContent = text;
    statusEl.setAttribute("data-status", className);
  }

  private updateButtons(connected: boolean): void {
    const connectBtn = document.getElementById(
      "connectBtn",
    ) as HTMLButtonElement;
    const disconnectBtn = document.getElementById(
      "disconnectBtn",
    ) as HTMLButtonElement;

    connectBtn.disabled = connected;
    disconnectBtn.disabled = !connected;
  }

  private async initialize(): Promise<void> {
    const result = await this.sendRequest("initialize", {
      processId: null,
      clientInfo: {
        name: "Debug Client",
        version: "1.0.0",
      },
      rootUri: "file:///debug",
      capabilities: {
        textDocument: {
          synchronization: {
            dynamicRegistration: false,
            willSave: false,
            willSaveWaitUntil: false,
            didSave: true,
          },
          completion: {
            dynamicRegistration: false,
            completionItem: {
              snippetSupport: true,
              documentationFormat: ["markdown", "plaintext"],
            },
          },
          publishDiagnostics: {
            relatedInformation: true,
          },
        },
      },
    });

    console.log("Initialize result:", result);

    this.sendNotification("initialized", {});
    this.openDocument();
  }

  private openDocument(): void {
    if (!this.editorView) return;

    const content = this.editorView.state.doc.toString();
    this.documentVersion++;

    this.sendNotification("textDocument/didOpen", {
      textDocument: {
        uri: this.documentUri,
        languageId: "fhirpath",
        version: this.documentVersion,
        text: content,
      },
    });
  }

  updateDocument(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.editorView)
      return;

    const content = this.editorView.state.doc.toString();
    this.documentVersion++;

    this.sendNotification("textDocument/didChange", {
      textDocument: {
        uri: this.documentUri,
        version: this.documentVersion,
      },
      contentChanges: [
        {
          text: content,
        },
      ],
    });
  }

  private async shutdown(): Promise<void> {
    await this.sendRequest("shutdown", {});
    this.sendNotification("exit", {});
  }

  clearMessages(): void {
    this.messageHistory = [];
    this.renderMessages();
  }
}

// Initialize and setup event handlers
const client = new LSPClient();

// Connect button
document.getElementById("connectBtn")?.addEventListener("click", () => {
  client.connect();
});

// Disconnect button
document.getElementById("disconnectBtn")?.addEventListener("click", () => {
  client.disconnect();
});

// Clear buttons
document.getElementById("clearDiagnostics")?.addEventListener("click", () => {
  const diagnosticsDiv = document.getElementById("diagnostics")!;
  const countSpan = document.getElementById("diagnosticCount")!;
  diagnosticsDiv.innerHTML = "";
  countSpan.textContent = "0";
});

document.getElementById("clearMessages")?.addEventListener("click", () => {
  client.clearMessages();
});

// Auto-connect on load
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    setTimeout(() => client.connect(), 500);
  });
} else {
  setTimeout(() => client.connect(), 500);
}
