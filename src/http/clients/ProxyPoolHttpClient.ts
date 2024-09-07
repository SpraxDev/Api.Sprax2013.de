import { inject, singleton } from 'tsyringe';
import * as Undici from 'undici';
import SentrySdk from '../../SentrySdk.js';
import ResolvedToNonUnicastIpError from '../dns/errors/ResolvedToNonUnicastIpError.js';
import UnicastOnlyDnsResolver from '../dns/UnicastOnlyDnsResolver.js';
import HttpResponse from '../HttpResponse.js';
import { FullRequestOptions } from './HttpClient.js';
import SimpleHttpClient from './SimpleHttpClient.js';
import SocksProxyAgent from './SocksProxyAgent.js';

type ProxyServer = {
  simplifiedUri: string,
  displayName: string,
  dispatcher: Undici.Dispatcher
};

@singleton()
export default class ProxyPoolHttpClient extends SimpleHttpClient {
  private readonly proxies: ProxyServer[] = [];
  private nextProxyIndex = 0;

  constructor(
    @inject('value.proxy_server_uris') proxyUris: string[],
    unicastOnlyDnsResolver: UnicastOnlyDnsResolver
  ) {
    super();

    this.proxies = this.parseProxies(proxyUris, unicastOnlyDnsResolver);
    this.logWarningForDuplicateProxies();
  }

  get proxyCount(): number {
    return this.proxies.length;
  }

  protected async request(url: string, options: FullRequestOptions, triesLeft = 2): Promise<HttpResponse> {
    this.ensureUrlLooksLikePublicServer(url);

    const proxy = this.selectNextProxy();
    let response: Undici.Dispatcher.ResponseData;

    if (SimpleHttpClient.DEBUG_LOGGING) {
      console.debug(`[ProxyPoolHttpClient] >> ${options.method} ${url} (proxy=${proxy.displayName})`);
    }
    try {
      response = await Undici.request(url, {
        dispatcher: proxy.dispatcher,

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
    const proxy = this.selectNextProxy();
    return proxy.dispatcher;
  }

  private selectNextProxy(): ProxyServer {
    if (this.proxies.length === 0) {
      throw new Error('No proxies available');
    }

    const proxy = this.proxies[this.nextProxyIndex];
    this.nextProxyIndex = (this.nextProxyIndex + 1) % this.proxies.length;
    return proxy;
  }

  private createHttpProxy(url: URL): ProxyServer {
    if (url.pathname !== '/') {
      throw new Error(`Proxy URL must not contain a path: ${url.toString()}`);
    }

    let authorizationHeaderValue: string | undefined = undefined;
    if (url.username.length > 0 && url.password.length > 0) {
      authorizationHeaderValue = 'Basic ' + Buffer.from(`${decodeURIComponent(url.username)}:${decodeURIComponent(url.password)}`).toString('base64');
    }

    const uri = `${url.protocol}//${url.host}/`;
    return {
      simplifiedUri: uri,
      displayName: url.searchParams.get('name')?.trim() || uri,
      dispatcher: new Undici.ProxyAgent({
        ...this.getDefaultAgentOptions(),
        uri,
        token: authorizationHeaderValue,
        proxyTls: {
          timeout: 3000
        }
      })
    };
  }

  private createSocksProxy(url: URL, unicastOnlyDnsResolver: UnicastOnlyDnsResolver): ProxyServer {
    const uri = `${url.protocol}//${url.host}/`;
    let proxyHost = url.hostname;
    if (proxyHost.startsWith('[') && proxyHost.endsWith(']')) {
      proxyHost = proxyHost.slice(1, -1);
    }

    return {
      simplifiedUri: uri,
      displayName: url.searchParams.get('name')?.trim() || uri,
      dispatcher: new SocksProxyAgent(
        {
          proxyOptions: {
            version: url.protocol === 'socks5:' ? 5 : 4,
            host: proxyHost,
            port: parseInt(url.port, 10),

            username: decodeURIComponent(url.username),
            password: decodeURIComponent(url.password),

            timeout: 3000
          }
        },
        unicastOnlyDnsResolver
      )
    };
  }

  private parseProxies(proxyUris: string[], unicastOnlyDnsResolver: UnicastOnlyDnsResolver): ProxyServer[] {
    const proxies: ProxyServer[] = [];

    for (const proxyUri of proxyUris.toSorted(() => Math.random() - 0.5)) {
      const parsedUri = new URL(proxyUri);

      let proxy: ProxyServer;
      switch (parsedUri.protocol) {
        case 'http:':
        case 'https:':
          proxy = this.createHttpProxy(parsedUri);
          break;

        case 'socks5:':
        case 'socks4:':
          proxy = this.createSocksProxy(parsedUri, unicastOnlyDnsResolver);
          break;

        default:
          throw new Error(`Proxy server URI uses an unsupported protocol: ${parsedUri.protocol}`);
      }

      proxies.push(proxy);
    }

    return proxies;
  }

  private logWarningForDuplicateProxies(): void {
    const encounteredSimplifiedUris = new Set<string>();
    const encounteredDisplayNames = new Set<string>();

    for (const proxy of this.proxies) {
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
