import Net from 'node:net';
import Socks from 'socks';
import { singleton } from 'tsyringe';
import { SocksProxyServer } from './ProxyServerConfigurationProvider.js';

@singleton()
export default class SocksProxyServerConnector {
  async createConnection(proxy: SocksProxyServer, ip: string, port: number): Promise<Net.Socket> {
    const socksOpts: Socks.SocksClientOptions = {
      command: 'connect',
      proxy: {
        type: proxy.socksProxyOptions.version,
        host: proxy.socksProxyOptions.host,
        port: proxy.socksProxyOptions.port || 1080,
        userId: proxy.username,
        password: proxy.password
      },
      timeout: proxy.socksProxyOptions.timeout,
      destination: {
        host: ip,
        port: port
      }
    };

    return (await Socks.SocksClient.createConnection(socksOpts)).socket;
  }
}
