import { SocksClientError } from 'socks';
import { container, singleton } from 'tsyringe';
import * as Undici from 'undici';
import ProxyServerConfigurationProvider, {
  ProxyServer,
  SocksProxyServer
} from '../../net/proxy/ProxyServerConfigurationProvider.js';
import RoundRobinProxyPool from '../../net/proxy/RoundRobinProxyPool.js';
import SentrySdk from '../../SentrySdk.js';
import ProxyPoolHttpClientHealthcheckTask from '../../task_queue/tasks/ProxyPoolHttpClientHealthcheckTask.js';
import ResolvedToNonUnicastIpError from '../dns/errors/ResolvedToNonUnicastIpError.js';
import HttpResponse from '../HttpResponse.js';
import { FullRequestOptions } from './HttpClient.js';
import SimpleHttpClient from './SimpleHttpClient.js';
import SocksProxyAgentFactory from './SocksProxyAgentFactory.js';

export type UndiciProxyServer = ProxyServer & {
  readonly undiciDispatcher: Undici.Dispatcher,
  health: {
    readonly unhealthy: boolean,
    readonly unhealthySince?: Date,
    readonly lastChecked?: Date,
    readonly lastReferenceRttMs?: number
  }
}

@singleton()
export default class ProxyPoolHttpClient extends SimpleHttpClient {
  public readonly proxyPool: RoundRobinProxyPool<UndiciProxyServer>;
  private readonly retriesOnProxyError = 0;

  constructor(
    proxyServerConfigurationProvider: ProxyServerConfigurationProvider,
    socksProxyAgentFactory: SocksProxyAgentFactory
  ) {
    super();

    const proxies = this.parseProxies(proxyServerConfigurationProvider.getProxyServers(), socksProxyAgentFactory);
    this.logWarningForDuplicateProxies(proxies);

    this.proxyPool = new RoundRobinProxyPool(proxies);

    container.resolve(ProxyPoolHttpClientHealthcheckTask).registerHttpClient(this);
  }

  get proxyCount(): number {
    return this.proxyPool.proxyCount;
  }

  protected async request(url: string, options: FullRequestOptions, triesLeft = this.retriesOnProxyError): Promise<HttpResponse> {
    this.ensureUrlLooksLikePublicServer(url);

    const proxy = this.selectNextProxy();
    let response: Undici.Dispatcher.ResponseData;

    if (SimpleHttpClient.DEBUG_LOGGING) {
      console.debug(`[ProxyPoolHttpClient] >> ${options.method} ${url} (proxy=${proxy.displayName})`);
    }
    try {
      response = await Undici.request(url, {
        dispatcher: proxy.undiciDispatcher,

        method: options.method,
        query: options?.query,
        body: options?.body,
        headers: super.mergeWithDefaultHeaders(options?.headers)
      });
    } catch (err: any) {
      if (err instanceof ResolvedToNonUnicastIpError) {
        throw err;
      }

      if (this.isSocketError(err)) {
        proxy.health = {
          ...proxy.health,
          unhealthy: true,
          unhealthySince: proxy.health.unhealthySince ?? new Date(),
          lastChecked: new Date()
        };
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

  private selectNextProxy(): UndiciProxyServer {
    const firstProxySelected = this.proxyPool.selectNextProxy();
    let proxy = firstProxySelected;
    while (proxy.health.unhealthy) {
      proxy = this.proxyPool.selectNextProxy();
      if (proxy === firstProxySelected) {
        throw new Error('All configured proxies are unhealthy');
      }
    }
    return proxy;
  }

  private isSocketError(err: unknown): boolean {
    if (err instanceof SocksClientError) {
      return err.message.includes('ECONNREFUSED');
    }
    return false;
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
      }),
      health: { unhealthy: false }
    };
  }

  private createSocksProxy(proxy: SocksProxyServer, socksProxyAgentFactory: SocksProxyAgentFactory): UndiciProxyServer {
    return {
      ...proxy,
      undiciDispatcher: socksProxyAgentFactory.create(proxy, this.getDefaultAgentOptions()),
      health: { unhealthy: false }
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
