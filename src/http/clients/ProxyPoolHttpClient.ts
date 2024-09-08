import { singleton } from 'tsyringe';
import * as Undici from 'undici';
import ProxyServerConfigurationProvider, {
  ProxyServer,
  SocksProxyServer
} from '../../net/proxy/ProxyServerConfigurationProvider.js';
import RoundRobinProxyPool from '../../net/proxy/RoundRobinProxyPool.js';
import SentrySdk from '../../SentrySdk.js';
import ResolvedToNonUnicastIpError from '../dns/errors/ResolvedToNonUnicastIpError.js';
import HttpResponse from '../HttpResponse.js';
import { FullRequestOptions } from './HttpClient.js';
import SimpleHttpClient from './SimpleHttpClient.js';
import SocksProxyAgentFactory from './SocksProxyAgentFactory.js';

type UndiciProxyServer = ProxyServer & {
  undiciDispatcher: Undici.Dispatcher
}

@singleton()
export default class ProxyPoolHttpClient extends SimpleHttpClient {
  private readonly proxyPool: RoundRobinProxyPool<UndiciProxyServer>;

  constructor(
    proxyServerConfigurationProvider: ProxyServerConfigurationProvider,
    socksProxyAgentFactory: SocksProxyAgentFactory
  ) {
    super();

    const proxies = this.parseProxies(proxyServerConfigurationProvider.getProxyServers(), socksProxyAgentFactory);
    this.logWarningForDuplicateProxies(proxies);

    this.proxyPool = new RoundRobinProxyPool(proxies);
  }

  get proxyCount(): number {
    return this.proxyPool.proxyCount;
  }

  protected async request(url: string, options: FullRequestOptions, triesLeft = 2): Promise<HttpResponse> {
    this.ensureUrlLooksLikePublicServer(url);

    const proxy = this.proxyPool.selectNextProxy();
    let response: Undici.Dispatcher.ResponseData;

    if (SimpleHttpClient.DEBUG_LOGGING) {
      console.debug(`[ProxyPoolHttpClient] >> ${options.method} ${url} (proxy=${proxy.displayName})`);
    }
    try {
      response = await Undici.request(url, {
        dispatcher: proxy.undiciDispatcher,

        method: options.method,
        query: options?.query,
        headers: super.mergeWithDefaultHeaders(options?.headers)
      });
    } catch (err: any) {
      if (err instanceof ResolvedToNonUnicastIpError) {
        throw err;
      }

      SentrySdk.logAndCaptureWarning(`Failed to request '${url}' with proxy '${proxy.displayName}': ${err.message}`, { err });
      if (triesLeft > 0) {
        return this.request(url, options, triesLeft - 1);
      }

      throw new Error(`Failed to request '${url}' using proxies (no more retries left): ${err.message}`, { cause: err });
    }

    const httpResponse = await HttpResponse.fromUndiciResponse(response);
    if (SimpleHttpClient.DEBUG_LOGGING) {
      console.debug(`[ProxyPoolHttpClient] << Status ${httpResponse.statusCode} with ${httpResponse.body.length} bytes`);
    }
    return httpResponse;
  }

  protected selectDispatcher(): Undici.Dispatcher {
    const proxy = this.proxyPool.selectNextProxy();
    return proxy.undiciDispatcher;
  }

  private createHttpProxy(proxy: ProxyServer): UndiciProxyServer {
    let authorizationHeaderValue: string | undefined = undefined;
    if (proxy.username.length > 0 && proxy.password.length > 0) {
      authorizationHeaderValue = 'Basic ' + Buffer.from(`${decodeURIComponent(proxy.username)}:${decodeURIComponent(proxy.password)}`).toString('base64');
    }

    return {
      ...proxy,
      undiciDispatcher: new Undici.ProxyAgent({
        ...this.getDefaultAgentOptions(),
        uri: proxy.simplifiedUri,
        token: authorizationHeaderValue,
        proxyTls: {
          timeout: 3000
        }
      })
    };
  }

  private createSocksProxy(proxy: SocksProxyServer, socksProxyAgentFactory: SocksProxyAgentFactory): UndiciProxyServer {
    return {
      ...proxy,
      undiciDispatcher: socksProxyAgentFactory.create(proxy)
    };
  }

  private parseProxies(proxies: ProxyServer[], socksProxyAgentFactory: SocksProxyAgentFactory): UndiciProxyServer[] {
    const parsedProxies: UndiciProxyServer[] = [];

    for (const proxyServer of proxies) {
      const proxyProtocol = new URL(proxyServer.simplifiedUri).protocol;
      switch (proxyProtocol) {
        case 'http:':
        case 'https:':
          parsedProxies.push(this.createHttpProxy(proxyServer));
          break;

        case 'socks5:':
        case 'socks4:':
          parsedProxies.push(this.createSocksProxy(proxyServer as SocksProxyServer, socksProxyAgentFactory));
          break;

        default:
          throw new Error(`Proxy server URI uses an unsupported protocol: ${proxyProtocol}`);
      }
    }

    return parsedProxies;
  }

  private logWarningForDuplicateProxies(proxies: UndiciProxyServer[]): void {
    const encounteredSimplifiedUris = new Set<string>();
    const encounteredDisplayNames = new Set<string>();

    for (const proxy of proxies) {
      if (encounteredSimplifiedUris.has(proxy.simplifiedUri)) {
        SentrySdk.logAndCaptureWarning(`Proxy server '${proxy.simplifiedUri}' is configured multiple times`);
        continue;
      }
      if (encounteredDisplayNames.has(proxy.displayName)) {
        SentrySdk.logAndCaptureWarning(`Proxy server name '${proxy.displayName}' is configured multiple times`);
        continue;
      }

      encounteredSimplifiedUris.add(proxy.simplifiedUri);
      encounteredDisplayNames.add(proxy.displayName);
    }
  }
}
