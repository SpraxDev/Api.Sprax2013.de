import Net from 'node:net';
import ConnectionTimedOutError from './error/ConnectionTimedOutError.js';
import SocketClosedError from './error/SocketClosedError.js';

export type PingResult = {
  rttInMs: number;
  resolvedIp: string;
  legacyPing?: true;
  status: PotentialServerStatus;
}

export type PotentialServerStatus = {
  [key: string]: unknown;
  version?: {
    [key: string]: unknown;
    name?: string;
    protocol?: number;
  }
  players?: {
    [key: string]: unknown;
    max?: number;
    online?: number;
    sample?: { name: string, id: string }[];
  }
  description?: {
    [key: string]: unknown;
    text?: string;
  }
  favicon?: string;
}

export default abstract class AbstractMinecraftServerPing {
  protected readonly host: string;
  protected readonly port: number;
  protected readonly resolvedIp: string;
  protected readonly resolvedPort: number;

  private socket: Net.Socket | undefined;

  protected constructor(host: string, port: number, resolvedIp: string, resolvedPort: number) {
    this.host = host;
    this.port = port;
    this.resolvedIp = resolvedIp;
    this.resolvedPort = resolvedPort;
  }

  protected abstract onSocketConnected(socket: Net.Socket): void;

  protected abstract onSocketData(socket: Net.Socket, data: Buffer, resolve: (result: PingResult) => void): void;

  async ping(): Promise<PingResult> {
    if (this.socket != null) {
      throw new Error('Cannot ping multiple times using the same class instance');
    }

    this.socket = Net.createConnection({
      host: this.resolvedIp,
      port: this.resolvedPort,
      timeout: 2000,
      noDelay: true,

      lookup: (host, options, callback) => {
        callback(new Error('DNS lookups are not supported'), '');
      }
    });
    return this.promisifySocket(this.socket);
  }

  protected async promisifySocket(socket: Net.Socket): Promise<PingResult> {
    return new Promise((resolve, reject) => {
      socket.on('error', (err) => reject(err));
      socket.on('close', () => reject(new SocketClosedError()));
      socket.on('timeout', () => socket.destroy(new ConnectionTimedOutError()));

      socket.on('connect', () => this.onSocketConnected(socket));
      socket.on('data', (data) => {
        try {
          this.onSocketData(socket, data, resolve);
        } catch (err: any) {
          if (!(err instanceof Error)) {
            err = new Error('An unknown error occurred: ' + err);
          }
          socket.destroy(err);
        }
      });
    });
  }
}
