import Dns from 'node:dns';
import { singleton } from 'tsyringe';
import MapWithTtl from '../../../util/MapWithTtl.js';
import DnsResolver from './DnsResolver.js';
import DnsResolverInterface, { LookupAsyncResult } from './DnsResolverInterface.js';

@singleton()
export default class CachedDnsResolver implements DnsResolverInterface {
  private readonly cache = MapWithTtl.create<string, LookupAsyncResult>(60);

  constructor(
    private readonly dnsResolver: DnsResolver,
  ) {
  }

  lookup(
    hostname: string,
    options: Dns.LookupOptions,
    callback: (err: NodeJS.ErrnoException | null, address: string | Dns.LookupAddress[], family?: number) => void,
  ): void {
    this.lookupAsync(hostname, options)
      .then(result => callback(null, result.address, result.family))
      .catch((err) => callback(err, [], undefined));
  }

  async lookupAsync(hostname: string, options: Dns.LookupOptions): Promise<LookupAsyncResult> {
    const cacheKey = `${hostname}${options.family}${options.hints}${options.all}${options.order}${options.verbatim}`;

    let lookupResult = this.cache.get(cacheKey);
    if (lookupResult == null) {
      lookupResult = await this.dnsResolver.lookupAsync(hostname, options);
      this.cache.set(cacheKey, lookupResult);
    }

    return lookupResult;
  }
}
