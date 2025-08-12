import { singleton } from 'tsyringe';
import { Dispatcher } from 'undici';
import SentrySdk from '../../util/SentrySdk.js';
import { PerformanceMonitor } from '../../util/PerformanceMonitor.js';
import ResolvedToNonUnicastIpError from '../dns/errors/ResolvedToNonUnicastIpError.js';
import HttpResponse from '../HttpResponse.js';
import HttpClient, { FullRequestOptions, GetRequestOptions, PostRequestOptions } from './HttpClient.js';
import ProxyPoolHttpClient from './ProxyPoolHttpClient.js';
import SimpleHttpClient from './SimpleHttpClient.js';

@singleton()
export default class AutoProxiedHttpClient extends HttpClient {
  private static readonly HOSTS_THAT_DO_NOT_REQUIRE_A_PROXY = [
    'api.minecraftservices.com',
    'sessionserver.mojang.com',
    'textures.minecraft.net',

    'dl.labymod.net',
    's.optifine.net',
  ];

  private nextNonProxyRequest = 0;
  private readonly inFlightRequests = new Map<string, Promise<HttpResponse>>();

  constructor(
    private readonly proxyPoolHttpClient: ProxyPoolHttpClient,
    private readonly simpleHttpClient: SimpleHttpClient,
  ) {
    super();
  }

  async get(url: string, options?: GetRequestOptions, triesLeft = 2, baseDelay = 1000): Promise<HttpResponse> {
    // Create a cache key for request deduplication
    const cacheKey = `GET:${url}:${JSON.stringify(options || {})}`;
    
    // Check if this request is already in flight
    if (this.inFlightRequests.has(cacheKey)) {
      PerformanceMonitor.recordCacheHit('request_dedup');
      return await this.inFlightRequests.get(cacheKey)!;
    }

    const requestPromise = this._performGet(url, options, triesLeft, baseDelay);
    this.inFlightRequests.set(cacheKey, requestPromise);
    
    try {
      return await requestPromise;
    } finally {
      this.inFlightRequests.delete(cacheKey);
    }
  }

  private async _performGet(url: string, options?: GetRequestOptions, triesLeft = 2, baseDelay = 1000): Promise<HttpResponse> {
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
        // Exponential backoff with jitter to prevent thundering herd
        const delay = baseDelay * Math.pow(2, 2 - triesLeft) + Math.random() * 1000;
        PerformanceMonitor.recordRetryAvoidance();
        await new Promise(resolve => setTimeout(resolve, delay));
        return this._performGet(url, options, triesLeft - 1, baseDelay);
      }

      throw new Error(`Failed to request '${url}': ${err.message}`, { cause: err });
    }
  }

  async post(url: string, options?: PostRequestOptions, triesLeft = 2, baseDelay = 1000): Promise<HttpResponse> {
    // For POST requests, we typically don't want to deduplicate as they might have side effects
    // But we can still optimize the retry logic
    return this._performPost(url, options, triesLeft, baseDelay);
  }

  private async _performPost(url: string, options?: PostRequestOptions, triesLeft = 2, baseDelay = 1000): Promise<HttpResponse> {
    let httpClient = 'SimpleHttpClient';
    try {
      if (this.shouldRequestThroughProxy(url)) {
        httpClient = 'ProxyPoolHttpClient';
        --this.nextNonProxyRequest;
        return await this.proxyPoolHttpClient.post(url, options);
      }

      this.nextNonProxyRequest = this.proxyPoolHttpClient.proxyCount;
      return await this.simpleHttpClient.post(url, options);
    } catch (err: any) {
      if (err instanceof ResolvedToNonUnicastIpError) {
        throw err;
      }

      SentrySdk.logAndCaptureWarning(`Failed to request '${url}' using ${httpClient}: ${err.message}`, { err });
      if (triesLeft > 0) {
        // Exponential backoff with jitter to prevent thundering herd
        const delay = baseDelay * Math.pow(2, 2 - triesLeft) + Math.random() * 1000;
        PerformanceMonitor.recordRetryAvoidance();
        await new Promise(resolve => setTimeout(resolve, delay));
        return this._performPost(url, options, triesLeft - 1, baseDelay);
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
