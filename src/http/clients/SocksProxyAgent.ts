import Net from 'node:net';
import Socks from 'socks';
import * as Undici from 'undici';
import ResolvedToNonUnicastIpError from '../dns/errors/ResolvedToNonUnicastIpError.js';
import UnicastOnlyDnsResolver from '../dns/UnicastOnlyDnsResolver.js';

export type SocksProxyOptions = {
  version: 4 | 5;
  host: string;
  port?: number;
  username?: string;
  password?: string;
  timeout?: number;
}
export type SocksProxyAgentOptions = Omit<Undici.Agent.Options, 'connect'> & { proxyOptions: SocksProxyOptions };

export default class SocksProxyAgent extends Undici.Agent {
  constructor(options: SocksProxyAgentOptions, unicastOnlyDnsResolver: UnicastOnlyDnsResolver) {
    super({
      ...options,
      connect: SocksProxyAgent.createConnector(options.proxyOptions, unicastOnlyDnsResolver)
    });
  }

  private static createConnector(proxyOptions: SocksProxyOptions, unicastOnlyDnsResolver: UnicastOnlyDnsResolver): Undici.buildConnector.connector {
    const undiciConnect = Undici.buildConnector({ timeout: proxyOptions.timeout });

    return async (options, callback): Promise<void> => {
      const socksOpts: Socks.SocksClientOptions = {
        command: 'connect',
        proxy: {
          type: proxyOptions.version,
          host: proxyOptions.host,
          port: proxyOptions.port || 1080,
          userId: proxyOptions.username,
          password: proxyOptions.password
        },
        timeout: proxyOptions.timeout,
        destination: {
          host: options.hostname,
          port: parseInt(options.port, 10) || this.determineDefaultPort(options.protocol)
        }
      };

      if (!await unicastOnlyDnsResolver.resolvesToUnicastIp(socksOpts.destination.host)) {
        return callback(new ResolvedToNonUnicastIpError(socksOpts.destination.host), null);
      }

      let socket: Net.Socket;
      try {
        socket = (await Socks.SocksClient.createConnection(socksOpts)).socket;
      } catch (err: any) {
        return callback(err, null);
      }

      if (options.protocol === 'https:') {
        return undiciConnect({ ...options, httpSocket: socket }, callback);
      }
      return callback(null, socket.setNoDelay());
    };
  }

  private static determineDefaultPort(protocol: string): number {
    switch (protocol) {
      case 'https:':
        return 443;
      case 'http:':
        return 80;

      default:
        throw new Error(`Unsupported protocol: ${protocol}`);
    }
  }
}
