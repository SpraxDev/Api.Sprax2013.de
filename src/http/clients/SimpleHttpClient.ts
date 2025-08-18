import { UndiciHttpClient } from '@spraxdev/node-commons/http';
import IpAddrJs from 'ipaddr.js';
import Net from 'node:net';
import { container, injectable } from 'tsyringe';
import * as Undici from 'undici';
import { IS_PRODUCTION } from '../../constants.js';
import Metrics from '../../metrics/Metrics.js';
import ResolvedToNonUnicastIpError from '../dns/errors/ResolvedToNonUnicastIpError.js';
import UnicastOnlyDnsResolver from '../dns/resolver/UnicastOnlyDnsResolver.js';
import UserAgentGenerator from '../UserAgentGenerator.js';

// TODO: Supporting cookies might be a good idea
@injectable()
export default class SimpleHttpClient extends UndiciHttpClient {
  protected static readonly DEBUG_LOGGING = !IS_PRODUCTION;

  constructor(
    protected readonly metrics: Metrics,
  ) {
    super(process.env.SPRAXAPI_USER_AGENT || UserAgentGenerator.generateDefault());
    this.registerDefaultEventListeners();
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

  protected registerDefaultEventListeners(): void {
    this.addEventListener('preRequest', (event) => {
      if (SimpleHttpClient.DEBUG_LOGGING) {
        console.debug(`[HttpClient] >> ${event.request.options.method} ${event.request.url}`);
      }

      this.ensureUrlLooksLikePublicServer(event.request.url);
    });

    this.addEventListener('postRequest', (event) => {
      if (SimpleHttpClient.DEBUG_LOGGING) {
        console.debug(`[HttpClient] << Status ${event.response.statusCode} with ${event.response.body.length} bytes`);
      }
      this.metrics.collectOutgoingHttpRequest(event.request.options.method, event.request.url, event.response.statusCode);
    });
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
