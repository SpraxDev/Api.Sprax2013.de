import IpAddrJs from 'ipaddr.js';
import Dns from 'node:dns';
import { singleton } from 'tsyringe';
import CachedDnsResolver from './CachedDnsResolver.js';
import DnsResolverInterface, { LookupAsyncResult } from './DnsResolverInterface.js';
import ResolvedToNonUnicastIpError from '../errors/ResolvedToNonUnicastIpError.js';

@singleton()
export default class UnicastOnlyDnsResolver implements DnsResolverInterface {
  constructor(
    private readonly dnsResolver: CachedDnsResolver,
  ) {
  }

  lookup(
    hostname: string,
    options: Dns.LookupOptions,
    callback: (err: (NodeJS.ErrnoException | null), address: (string | Dns.LookupAddress[]), family?: number) => void,
  ): void {
    this.lookupAsync(hostname, options)
      .then(result => callback(null, result.address, result.family))
      .catch((err) => callback(err, [], undefined));
  }

  async lookupAsync(hostname: string, options: Dns.LookupOptions): Promise<LookupAsyncResult> {
    const result = await this.dnsResolver.lookupAsync(hostname, options);

    const addressesToCheck = Array.isArray(result.address) ? result.address : [{ address: result.address }];
    for (const addressItem of addressesToCheck) {
      const parsedHost = IpAddrJs.parse(addressItem.address);
      if (parsedHost.range() !== 'unicast') {
        throw new ResolvedToNonUnicastIpError(parsedHost.range());
      }
    }

    return result;
  }

  async resolvesToUnicastIp(hostname: string): Promise<boolean> {
    try {
      await this.lookupAsync(hostname, { all: true });
      return true;
    } catch (err) {
      if (err instanceof ResolvedToNonUnicastIpError) {
        return false;
      }

      throw err;
    }
  }
}
