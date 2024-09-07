import IpAddrJs from 'ipaddr.js';
import Net from 'node:net';
import * as Undici from 'undici';
import ResolvedToNonUnicastIpError from '../dns/errors/ResolvedToNonUnicastIpError.js';
import HttpResponse from '../HttpResponse.js';

export type BaseRequestOptions = {
  headers?: { [key: string]: string };
}

export interface GetRequestOptions extends BaseRequestOptions {
  query?: { [key: string]: string | number | boolean };
}

export interface FullRequestOptions extends BaseRequestOptions, GetRequestOptions {
  method: 'GET';
}

export default abstract class HttpClient {
  public abstract get(url: string, options?: GetRequestOptions): Promise<HttpResponse>;

  protected abstract request(url: string, options: FullRequestOptions): Promise<HttpResponse>;

  protected abstract selectDispatcher(): Undici.Dispatcher;

  protected getDefaultAgentOptions(): Undici.Agent.Options {
    return {
      maxRedirections: 5,
      maxResponseSize: 20 * 1024 * 1024 /* 20 MiB */,
      bodyTimeout: 12_000,
      headersTimeout: 12_000
    };
  }

  /**
   * @throws ResolvedToNonUnicastIpError
   */
  protected ensureUrlLooksLikePublicServer(url: string): void {
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
}
