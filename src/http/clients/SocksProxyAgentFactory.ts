import Net from 'node:net';
import { singleton } from 'tsyringe';
import * as Undici from 'undici';
import { SocksProxyServer } from '../../net/proxy/ProxyServerConfigurationProvider.js';
import SocksProxyServerConnector from '../../net/proxy/SocksProxyServerConnector.js';
import ResolvedToNonUnicastIpError from '../dns/errors/ResolvedToNonUnicastIpError.js';
import UnicastOnlyDnsResolver from '../dns/UnicastOnlyDnsResolver.js';

@singleton()
export default class SocksProxyAgentFactory {
  constructor(
    private readonly unicastOnlyDnsResolver: UnicastOnlyDnsResolver,
    private readonly socksProxyServerConnector: SocksProxyServerConnector
  ) {
  }

  create(proxy: SocksProxyServer, agentOptions: Omit<Undici.Agent.Options, 'connect'>): Undici.Agent {
    return new Undici.Agent({
      ...agentOptions,
      connect: this.createConnector(proxy)
    });
  }

  private createConnector(proxy: SocksProxyServer): Undici.buildConnector.connector {
    const undiciConnect = Undici.buildConnector({ timeout: proxy.socksProxyOptions.timeout });

    return async (options, callback): Promise<void> => {
      const destinationIp = options.hostname;
      const destinationPort = parseInt(options.port, 10) || SocksProxyAgentFactory.determineDefaultPort(options.protocol);

      if (!(await this.unicastOnlyDnsResolver.resolvesToUnicastIp(destinationIp))) {
        return callback(new ResolvedToNonUnicastIpError(destinationIp), null);
      }

      let socket: Net.Socket;
      try {
        socket = await this.socksProxyServerConnector.createConnection(proxy, destinationIp, destinationPort);
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
