import { spawn, ChildProcess } from 'child_process';

export class LSPTestClient {
  private server: ChildProcess;
  private messageId = 0;
  private buffer = '';
  private contentLength: number | null = null;
  private responseHandlers = new Map<number, (response: any) => void>();
  private diagnosticsHandlers: ((diagnostics: any) => void)[] = [];
  public receivedDiagnostics: any[] = [];

  constructor(serverCommand: string, serverArgs: string[]) {
    this.server = spawn(serverCommand, serverArgs, {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    this.server.stdout!.on('data', (chunk) => this.handleData(chunk));
    this.server.stderr!.on('data', (data) => {
      console.error('Server:', data.toString());
    });
  }

  private handleData(chunk: Buffer): void {
    this.buffer += chunk.toString();
    
    while (true) {
      if (this.contentLength === null) {
        const headerEnd = this.buffer.indexOf('\r\n\r\n');
        if (headerEnd === -1) break;
        
        const header = this.buffer.substring(0, headerEnd);
        const match = header.match(/Content-Length: (\d+)/);
        if (match) {
          this.contentLength = parseInt(match[1], 10);
          this.buffer = this.buffer.substring(headerEnd + 4);
        }
      }
      
      if (this.contentLength !== null) {
        if (this.buffer.length >= this.contentLength) {
          const message = this.buffer.substring(0, this.contentLength);
          this.buffer = this.buffer.substring(this.contentLength);
          this.contentLength = null;
          
          const json = JSON.parse(message);
          if (json.id && this.responseHandlers.has(json.id)) {
            this.responseHandlers.get(json.id)!(json);
            this.responseHandlers.delete(json.id);
          } else if (json.method === 'textDocument/publishDiagnostics') {
            // Handle diagnostics notification
            this.receivedDiagnostics.push(json.params);
            this.diagnosticsHandlers.forEach(handler => handler(json.params));
          }
        } else {
          break;
        }
      }
    }
  }

  async request(method: string, params?: any): Promise<any> {
    const id = ++this.messageId;
    const message = {
      jsonrpc: '2.0',
      id,
      method,
      params
    };
    
    const content = JSON.stringify(message);
    const header = `Content-Length: ${Buffer.byteLength(content)}\r\n\r\n`;
    
    return new Promise((resolve) => {
      this.responseHandlers.set(id, resolve);
      this.server.stdin!.write(header + content);
    });
  }

  notify(method: string, params?: any): void {
    const message = {
      jsonrpc: '2.0',
      method,
      params
    };
    
    const content = JSON.stringify(message);
    const header = `Content-Length: ${Buffer.byteLength(content)}\r\n\r\n`;
    this.server.stdin!.write(header + content);
  }

  onDiagnostics(handler: (diagnostics: any) => void): void {
    this.diagnosticsHandlers.push(handler);
  }

  async waitForDiagnostics(uri?: string, timeout: number = 5000): Promise<any> {
    return new Promise((resolve) => {
      const handler = (diagnostics: any) => {
        if (uri && diagnostics.uri !== uri) return;
        const index = this.diagnosticsHandlers.indexOf(handler);
        if (index > -1) {
          this.diagnosticsHandlers.splice(index, 1);
        }
        resolve(diagnostics);
      };
      this.onDiagnostics(handler);

      // Timeout fallback
      setTimeout(() => {
        const index = this.diagnosticsHandlers.indexOf(handler);
        if (index > -1) {
          this.diagnosticsHandlers.splice(index, 1);
        }
        resolve(null);
      }, timeout);
    });
  }

  async close(): Promise<void> {
    await this.request('shutdown');
    this.notify('exit');
    this.server.kill();
  }
}