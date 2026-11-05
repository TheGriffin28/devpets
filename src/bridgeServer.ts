import { WebSocketServer, WebSocket } from 'ws';
import { ExtensionToOverlayMessage, OverlayToExtensionMessage } from './types';

export class BridgeServer {
  private wss: WebSocketServer | null = null;
  private clients: Set<WebSocket> = new Set();
  private port: number = 49821;
  private onMessageCallback?: (msg: OverlayToExtensionMessage) => void;
  private onClientConnectedCallback?: () => void;

  public async start(preferredPort = 49821): Promise<number> {
    this.port = preferredPort;

    return new Promise((resolve, reject) => {
      const tryListen = (portToTry: number, attemptsLeft: number) => {
        const server = new WebSocketServer({ host: '127.0.0.1', port: portToTry });

        server.once('listening', () => {
          this.wss = server;
          this.port = portToTry;
          this.setupServerHandlers(server);
          resolve(portToTry);
        });

        server.once('error', (err: NodeJS.ErrnoException) => {
          if (err.code === 'EADDRINUSE' && attemptsLeft > 0) {
            tryListen(portToTry + 1, attemptsLeft - 1);
          } else {
            reject(err);
          }
        });
      };

      tryListen(preferredPort, 10);
    });
  }

  private setupServerHandlers(server: WebSocketServer) {
    server.on('connection', (ws: WebSocket) => {
      this.clients.add(ws);

      if (this.onClientConnectedCallback) {
        this.onClientConnectedCallback();
      }

      ws.on('message', (raw: Buffer | string) => {
        try {
          const parsed = JSON.parse(raw.toString()) as OverlayToExtensionMessage;
          if (this.onMessageCallback) {
            this.onMessageCallback(parsed);
          }
        } catch (err) {
          console.error('[CodeBird Bridge] Failed to parse message from overlay:', err);
        }
      });

      ws.on('close', () => {
        this.clients.delete(ws);
      });

      ws.on('error', () => {
        this.clients.delete(ws);
      });
    });
  }

  public onMessage(cb: (msg: OverlayToExtensionMessage) => void) {
    this.onMessageCallback = cb;
  }

  public onClientConnected(cb: () => void) {
    this.onClientConnectedCallback = cb;
  }

  public broadcast(msg: ExtensionToOverlayMessage) {
    const payload = JSON.stringify(msg);
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    }
  }

  public getPort(): number {
    return this.port;
  }

  public hasConnectedClients(): boolean {
    return this.clients.size > 0;
  }

  public stop() {
    for (const client of this.clients) {
      try {
        client.close();
      } catch {
        // ignore
      }
    }
    this.clients.clear();
    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }
  }
}

