import IpAddrJs from 'ipaddr.js';
import Net from 'node:net';
import { injectable } from 'tsyringe';
import * as Undici from 'undici';
import { IS_PRODUCTION } from '../constants.js';
import ResolvedToNonUnicastIpError from './dns/errors/ResolvedToNonUnicastIpError.js';
import UnicastOnlyDnsResolver from './dns/UnicastOnlyDnsResolver.js';
import HttpResponse from './HttpResponse.js';
import UserAgentGenerator from './UserAgentGenerator.js';

export type RequestOptions = {
  headers?: { [key: string]: string };
}

export interface GetRequestOptions extends RequestOptions {
  query?: { [key: string]: string | number | boolean };
}

// TODO: Supporting cookies might be a good idea
@injectable()
export default class HttpClient {
  private static readonly DEBUG_LOGGING = !IS_PRODUCTION;

  private readonly userAgent: string;
  private readonly agent: Undici.Agent;

  constructor() {
    this.userAgent = UserAgentGenerator.generateDefault();
    this.agent = new Undici.Agent({
      maxRedirections: 5,
      maxResponseSize: 20 * 1024 * 1024 /* 20 MiB */,
      bodyTimeout: 15_000,
      headersTimeout: 15_000,
      connect: {
        lookup: new UnicastOnlyDnsResolver().lookup
      }
    });
  }

  async get(url: string, options?: GetRequestOptions): Promise<HttpResponse> {
    if (HttpClient.DEBUG_LOGGING) {
      console.debug(`[HttpClient] >> GET ${url}`);
    }

    this.ensureUrlLooksLikePublicServer(url);
    const response = await Undici.request(url, {
      dispatcher: this.agent,
      query: options?.query,
      headers: this.mergeWithDefaultHeaders(options?.headers)
    });
    const httpResponse = await HttpResponse.fromUndiciResponse(response);

    if (HttpClient.DEBUG_LOGGING) {
      console.debug(`[HttpClient] << Status ${httpResponse.statusCode} with ${httpResponse.body.length} bytes`);
    }
    return httpResponse;
  }

  private ensureUrlLooksLikePublicServer(url: string): void {
    let hostname = new URL(url).hostname;

    if (Net.isIP(hostname) === 0) {
      hostname = hostname.substring(1, hostname.length - 1);
      if (!hostname.includes(':') || !Net.isIPv6(hostname)) {
        return;
      }
    }

    const parsedHost = IpAddrJs.parse(hostname);
    if (parsedHost.range() !== 'unicast') {
      throw new ResolvedToNonUnicastIpError(parsedHost.range());
    }
  }

  private mergeWithDefaultHeaders(headers?: RequestOptions['headers']): Map<string, string | string[]> {
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
