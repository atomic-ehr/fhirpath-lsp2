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
  private editor: any = null;
  private currentDiagnostics: any[] = [];
  private markers: any[] = [];
  private currentTooltip: HTMLElement | null = null;

  constructor() {
    this.initializeEditor();
  }

  private initializeEditor(): void {
    const editorElement = document.getElementById("editor");
    if (!editorElement) return;

    // Create CodeMirror editor
    const initialText = `Patient
   .name
   .where( use = 'official' )
   .first()`;
    
    this.editor = (window as any).CodeMirror(editorElement, {
      value: initialText,
      mode: "javascript",
      lineNumbers: true,
      theme: "default",
      lineWrapping: false,
      gutters: ["CodeMirror-lint-markers"],
    });

    // Set up change handler
    this.editor.on("change", () => {
      this.onEditorChange();
    });
    
    // Set up hover handler for diagnostics
    this.setupHoverTooltips();
  }
  
  private setupHoverTooltips(): void {
    const wrapper = this.editor.getWrapperElement();
    
    wrapper.addEventListener('mousemove', (e: MouseEvent) => {
      const pos = this.editor.coordsChar({ left: e.clientX, top: e.clientY });
      const diagnostic = this.getDiagnosticAtPosition(pos);
      
      if (diagnostic) {
        this.showTooltip(e.clientX, e.clientY, diagnostic);
      } else {
        this.hideTooltip();
      }
    });
    
    wrapper.addEventListener('mouseleave', () => {
      this.hideTooltip();
    });
  }
  
  private getDiagnosticAtPosition(pos: any): any {
    if (!pos || pos.line === null || pos.ch === null) return null;
    
    for (const diagnostic of this.currentDiagnostics) {
      const start = diagnostic.range.start;
      const end = diagnostic.range.end;
      
      // Check if position is within diagnostic range
      if (pos.line >= start.line && pos.line <= end.line) {
        if (pos.line === start.line && pos.line === end.line) {
          // Single line diagnostic
          if (pos.ch >= start.character && pos.ch <= end.character) {
            return diagnostic;
          }
        } else if (pos.line === start.line) {
          // Start line of multi-line diagnostic
          if (pos.ch >= start.character) {
            return diagnostic;
          }
        } else if (pos.line === end.line) {
          // End line of multi-line diagnostic
          if (pos.ch <= end.character) {
            return diagnostic;
          }
        } else {
          // Middle line of multi-line diagnostic
          return diagnostic;
        }
      }
    }
    
    return null;
  }
  
  private showTooltip(x: number, y: number, diagnostic: any): void {
    // Remove existing tooltip
    this.hideTooltip();
    
    // Create new tooltip
    const tooltip = document.createElement('div');
    tooltip.className = 'cm-diagnostic-tooltip';
    
    // Add severity class
    if (diagnostic.severity === 1) {
      tooltip.classList.add('error');
    } else if (diagnostic.severity === 2) {
      tooltip.classList.add('warning');
    } else {
      tooltip.classList.add('info');
    }
    
    // Set content
    tooltip.textContent = diagnostic.message;
    
    // Position tooltip
    tooltip.style.left = x + 'px';
    tooltip.style.top = (y - 40) + 'px'; // Position above cursor
    
    document.body.appendChild(tooltip);
    this.currentTooltip = tooltip;
    
    // Adjust position if tooltip goes off screen
    setTimeout(() => {
      const rect = tooltip.getBoundingClientRect();
      if (rect.right > window.innerWidth) {
        tooltip.style.left = (window.innerWidth - rect.width - 10) + 'px';
      }
      if (rect.left < 0) {
        tooltip.style.left = '10px';
      }
      if (rect.top < 0) {
        tooltip.style.top = (y + 20) + 'px'; // Position below cursor instead
      }
    }, 0);
  }
  
  private hideTooltip(): void {
    if (this.currentTooltip) {
      this.currentTooltip.remove();
      this.currentTooltip = null;
    }
  }

  private onEditorChange(): void {
    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.updateDocument();
    }, 500) as any;
  }

  private debounceTimer: number | undefined;

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
        // Try parsing as plain JSON (simplified for WebSocket)
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
      // Timeout after 5 seconds
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

    // Store diagnostics
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

    // Update CodeMirror diagnostics
    this.updateEditorDiagnostics();
  }

  private updateEditorDiagnostics(): void {
    if (!this.editor) return;

    // Clear existing markers
    this.markers.forEach(marker => marker.clear());
    this.markers = [];

    // Add new markers for diagnostics
    this.currentDiagnostics.forEach(diagnostic => {
      const from = { line: diagnostic.range.start.line, ch: diagnostic.range.start.character };
      const to = { line: diagnostic.range.end.line, ch: diagnostic.range.end.character };
      
      const severityClass = diagnostic.severity === 1 ? 'cm-error-range' : 
                           diagnostic.severity === 2 ? 'cm-warning-range' : 
                           'cm-info-range';
      
      const marker = this.editor.markText(from, to, {
        className: severityClass,
        title: diagnostic.message
      });
      
      this.markers.push(marker);
    });
  }

  private addMessage(data: any, type: "send" | "receive"): void {
    const timestamp = new Date();
    const messageId = `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Store message in history
    this.messageHistory.unshift({
      id: messageId,
      type,
      method: data.method || (data.id ? `response:${data.id}` : "unknown"),
      timestamp,
      data,
    });

    // Keep only last 100 messages
    if (this.messageHistory.length > 100) {
      this.messageHistory.pop();
    }

    // Render all messages
    this.renderMessages();
  }

  private renderMessages(): void {
    const messagesDiv = document.getElementById("messages")!;
    messagesDiv.innerHTML = "";

    this.messageHistory.forEach((msg) => {
      const messageEl = document.createElement("div");
      messageEl.className = `message-item message-${msg.type}`;
      messageEl.dataset.messageId = msg.id;

      // Create header
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

      // Create body (hidden by default)
      const bodyEl = document.createElement("div");
      bodyEl.className = "message-body hidden";
      bodyEl.innerHTML = `<pre>${JSON.stringify(msg.data, null, 2)}</pre>`;

      messageEl.appendChild(headerEl);
      messageEl.appendChild(bodyEl);

      // Add click handler for expand/collapse
      headerEl.addEventListener("click", () => {
        const chevron = headerEl.querySelector(".message-chevron");
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
          publishDiagnostics: {
            relatedInformation: true,
          },
        },
      },
    });

    console.log("Initialize result:", result);

    this.sendNotification("initialized", {});

    // Open document
    this.openDocument();
  }

  private openDocument(): void {
    if (!this.editor) return;
    
    const content = this.editor.getValue();
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
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.editor) return;

    const content = this.editor.getValue();
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
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => client.connect(), 500);
  });
} else {
  // DOMContentLoaded has already fired
  setTimeout(() => client.connect(), 500);
}