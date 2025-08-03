import { container, injectable } from 'tsyringe';
import * as Undici from 'undici';
import { IS_PRODUCTION } from '../../constants.js';
import Metrics from '../../metrics/Metrics.js';
import UnicastOnlyDnsResolver from '../dns/resolver/UnicastOnlyDnsResolver.js';
import HttpResponse from '../HttpResponse.js';
import UserAgentGenerator from '../UserAgentGenerator.js';
import HttpClient, { FullRequestOptions, GetRequestOptions, PostRequestOptions } from './HttpClient.js';

// TODO: Supporting cookies might be a good idea
@injectable()
export default class SimpleHttpClient extends HttpClient {
  protected static readonly DEBUG_LOGGING = !IS_PRODUCTION;

  private readonly userAgent: string;
  private agent?: Undici.Dispatcher;

  constructor(
    protected readonly metrics: Metrics,
  ) {
    super();
    this.userAgent = process.env.SPRAXAPI_USER_AGENT || UserAgentGenerator.generateDefault();
  }

  get(url: string, options?: GetRequestOptions): Promise<HttpResponse> {
    return this.request(url, {
      ...options,
      method: 'GET',
    });
  }

  post(url: string, options?: PostRequestOptions): Promise<HttpResponse> {
    return this.request(url, {
      ...options,
      method: 'POST',
    });
  }

  protected async request(url: string, options: FullRequestOptions): Promise<HttpResponse> {
    this.ensureUrlLooksLikePublicServer(url);

    if (SimpleHttpClient.DEBUG_LOGGING) {
      console.debug(`[HttpClient] >> ${options.method} ${url}`);
    }

    const dispatcher = this.selectDispatcher();
    const response = await Undici.request(url, {
      dispatcher,

      method: options.method,
      query: options?.query,
      body: options?.body,
      headers: this.mergeWithDefaultHeaders(options?.headers),
    });
    const httpResponse = await HttpResponse.fromUndiciResponse(response);

    if (SimpleHttpClient.DEBUG_LOGGING) {
      console.debug(`[HttpClient] << Status ${httpResponse.statusCode} with ${httpResponse.body.length} bytes`);
    }
    this.metrics.collectOutgoingHttpRequest(options.method, url, httpResponse.statusCode);
    return httpResponse;
  }

  protected selectDispatcher(): Undici.Dispatcher {
    if (this.agent === undefined) {
      this.agent = new Undici.Agent(this.getDefaultAgentOptions());
    }
    return this.agent;
  }

  protected getDefaultAgentOptions(): Undici.Agent.Options {
    const dnsResolver = container.resolve(UnicastOnlyDnsResolver);
    return {
      ...super.getDefaultAgentOptions(),
      connect: {
        lookup: (hostname, options, callback) => dnsResolver.lookup(hostname, options, callback),
      },
    };
  }

  protected mergeWithDefaultHeaders(headers?: FullRequestOptions['headers']): Map<string, string | string[]> {
    const mergedHeaders = new Map<string, string | string[]>();
    mergedHeaders.set('user-agent', this.userAgent);
    mergedHeaders.set('accept', 'application/json');

    if (headers != null) {
      for (const [key, value] of Object.entries(headers)) {
        mergedHeaders.set(key.toLowerCase(), value);
      }
    }
    return mergedHeaders;
  }
}
