import { singleton } from 'tsyringe';
import { Dispatcher } from 'undici';
import SentrySdk from '../../SentrySdk.js';
import ResolvedToNonUnicastIpError from '../dns/errors/ResolvedToNonUnicastIpError.js';
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

  async get(url: string, options?: GetRequestOptions, triesLeft = 2): Promise<HttpResponse> {
    let httpClient = 'SimpleHttpClient';
    try {
      if (this.shouldRequestThroughProxy(url)) {
        httpClient = 'ProxyPoolHttpClient';
        --this.nextNonProxyRequest;
        return await this.proxyPoolHttpClient.get(url, options);
      }

      this.nextNonProxyRequest = this.proxyPoolHttpClient.proxyCount;
      return await this.simpleHttpClient.get(url, options);
    } catch (err: any) {
      if (err instanceof ResolvedToNonUnicastIpError) {
        throw err;
      }

      SentrySdk.logAndCaptureWarning(`Failed to request '${url}' using ${httpClient}: ${err.message}`, { err });
      if (triesLeft > 0) {
        return this.get(url, options, triesLeft - 1);
      }

      throw new Error(`Failed to request '${url}': ${err.message}`, { cause: err });
    }
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
