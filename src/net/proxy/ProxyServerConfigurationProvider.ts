import { inject, injectable } from 'tsyringe';
import SentrySdk from '../../SentrySdk.js';

export type SocksProxyOptions = {
  version: 4 | 5,
  host: string,
  port?: number,
  timeout?: number
}
export type ProxyServer = {
  simplifiedUri: string,
  displayName: string,

  username: string,
  password: string,

  socksProxyOptions?: SocksProxyOptions
};
export type SocksProxyServer = ProxyServer & { socksProxyOptions: SocksProxyOptions };

@injectable()
export default class ProxyServerConfigurationProvider {
  private static readonly SUPPORTED_PROTOCOLS = ['socks5:', 'socks4:', 'https:', 'http:'];

  private readonly proxies: ProxyServer[] = [];

  constructor(
    @inject('value.proxy_server_uris') proxyUris: string[]
  ) {
    this.proxies = this.parseProxies(proxyUris);
    this.logWarningForDuplicateProxies();
  }

  getProxyServers(): ProxyServer[] {
    return this.proxies;
  }

  getSocksProxyServers(): SocksProxyServer[] {
    return this.proxies.filter((proxy): proxy is SocksProxyServer => proxy.socksProxyOptions !== undefined);
  }

  private parseProxies(proxyUris: string[]): (ProxyServer | SocksProxyServer)[] {
    const proxies: (ProxyServer | SocksProxyServer)[] = [];

    for (const proxyUri of proxyUris.toSorted(() => Math.random() - 0.5)) {
      const parsedUri = new URL(proxyUri);
      if (!ProxyServerConfigurationProvider.SUPPORTED_PROTOCOLS.includes(parsedUri.protocol)) {
        throw new Error(`Proxy server URI uses an unsupported protocol: ${parsedUri.protocol}`);
      }

      if (parsedUri.pathname !== '/' && parsedUri.pathname !== '') {
        throw new Error(`Proxy server URL must not contain a path: ${parsedUri.toString()}`);
      }

      let proxyHost = parsedUri.hostname;
      if (proxyHost.startsWith('[') && proxyHost.endsWith(']')) {
        proxyHost = proxyHost.slice(1, -1);
      }

      let socksProxyOptions: SocksProxyOptions | undefined;
      if (parsedUri.protocol === 'socks5:' || parsedUri.protocol === 'socks4:') {
        socksProxyOptions = {
          version: parsedUri.protocol === 'socks5:' ? 5 : 4,
          host: proxyHost,
          port: parsedUri.port ? parseInt(parsedUri.port, 10) : undefined,

          timeout: 3000
        };
      }

      const simplifiedUri = `${parsedUri.protocol}//${parsedUri.host}/`;
      proxies.push({
        simplifiedUri,
        displayName: parsedUri.searchParams.get('name')?.trim() || simplifiedUri,
        username: decodeURIComponent(parsedUri.username),
        password: decodeURIComponent(parsedUri.password),
        socksProxyOptions
      });
    }

    return proxies;
  }

  private logWarningForDuplicateProxies(): void {
    const encounteredSimplifiedUris = new Set<string>();
    const encounteredDisplayNames = new Set<string>();

    for (const proxy of this.proxies) {
      if (encounteredSimplifiedUris.has(proxy.simplifiedUri)) {
        SentrySdk.logAndCaptureWarning(`Proxy server '${proxy.simplifiedUri}' is configured multiple times`);

        encounteredDisplayNames.add(proxy.displayName);
        continue;
      }

      if (encounteredDisplayNames.has(proxy.displayName)) {
        SentrySdk.logAndCaptureWarning(`Proxy server name '${proxy.displayName}' is configured multiple times`);

        encounteredSimplifiedUris.add(proxy.simplifiedUri);
        continue;
      }

      encounteredSimplifiedUris.add(proxy.simplifiedUri);
      encounteredDisplayNames.add(proxy.displayName);
    }
  }
}
