import { injectable } from 'tsyringe';
import Undici from 'undici';
import { IS_PRODUCTION } from '../constants.js';
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
      bodyTimeout: 15_000,
      headersTimeout: 15_000
    });
  }

  async get(url: string, options?: GetRequestOptions): Promise<HttpResponse> {
    if (HttpClient.DEBUG_LOGGING) {
      console.debug(`[HttpClient] >> GET ${url}`);
    }
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
