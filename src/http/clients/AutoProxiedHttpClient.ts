import { singleton } from 'tsyringe';
import { Dispatcher } from 'undici';
import HttpResponse from '../HttpResponse.js';
import HttpClient, { FullRequestOptions, GetRequestOptions } from './HttpClient.js';
import ProxyPoolHttpClient from './ProxyPoolHttpClient.js';
import SimpleHttpClient from './SimpleHttpClient.js';

@singleton()
export default class AutoProxiedHttpClient extends HttpClient {
  private static readonly HOSTS_THAT_DO_NOT_REQUIRE_A_PROXY = [
    'api.minecraftservices.com',
    'sessionserver.mojang.com',
    'textures.minecraft.net',

    'dl.labymod.net',
    's.optifine.net'
  ];

  private nextNonProxyRequest = 0;

  constructor(
    private readonly proxyPoolHttpClient: ProxyPoolHttpClient,
    private readonly simpleHttpClient: SimpleHttpClient
  ) {
    super();
  }

  get(url: string, options?: GetRequestOptions): Promise<HttpResponse> {
    if (this.shouldRequestThroughProxy(url)) {
      --this.nextNonProxyRequest;
      return this.proxyPoolHttpClient.get(url, options);
    }

    this.nextNonProxyRequest = this.proxyPoolHttpClient.proxyCount;
    return this.simpleHttpClient.get(url, options);
  }

  protected async request(_url: string, _options: FullRequestOptions): Promise<HttpResponse> {
    throw new Error('This method should never be called on this class');
  }

  protected selectDispatcher(): Dispatcher {
    throw new Error('This method should never be called on this class');
  }

  private shouldRequestThroughProxy(url: string): boolean {
    if (this.proxyPoolHttpClient.proxyCount <= 0) {
      return false;
    }
    return this.nextNonProxyRequest > 0 || this.doesHostRequireProxy(url);
  }

  private doesHostRequireProxy(url: string): boolean {
    const hostname = new URL(url).hostname;
    return !AutoProxiedHttpClient.HOSTS_THAT_DO_NOT_REQUIRE_A_PROXY.includes(hostname);
  }
}
