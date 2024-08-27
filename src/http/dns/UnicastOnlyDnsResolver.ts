import IpAddrJs from 'ipaddr.js';
import Dns from 'node:dns';
import dns from 'node:dns';
import ResolvedToNonUnicastIpError from './errors/ResolvedToNonUnicastIpError.js';

export default class UnicastOnlyDnsResolver {
  lookup(
    hostname: string,
    options: dns.LookupOptions,
    callback: (err: NodeJS.ErrnoException | null, address: string | dns.LookupAddress[], family?: number) => void
  ): void {
    Dns.lookup(hostname, options, (err, address, family): void => {
      if (err) {
        return callback(err, address, family);
      }

      if (typeof address === 'string') {
        const parsedHost = IpAddrJs.parse(address);
        if (parsedHost.range() !== 'unicast') {
          return callback(new ResolvedToNonUnicastIpError(parsedHost.range()), address, family);
        }
      } else {
        for (const addressItem of address) {
          const parsedHost = IpAddrJs.parse(addressItem.address);
          if (parsedHost.range() !== 'unicast') {
            return callback(new ResolvedToNonUnicastIpError(parsedHost.range()), address, family);
          }
        }
      }

      return callback(null, address, family);
    });
  }
}
