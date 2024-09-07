import IpAddrJs from 'ipaddr.js';
import Dns from 'node:dns';
import ResolvedToNonUnicastIpError from './errors/ResolvedToNonUnicastIpError.js';

export default class UnicastOnlyDnsResolver {
  lookup(
    hostname: string,
    options: Dns.LookupOptions,
    callback: (err: NodeJS.ErrnoException | null, address: string | Dns.LookupAddress[], family?: number) => void
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

  resolvesToUnicastIp(hostname: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
      this.lookup(hostname, { all: true }, (err) => {
        if (err instanceof ResolvedToNonUnicastIpError) {
          return resolve(false);
        }
        if (err != null) {
          return reject(err);
        }

        resolve(true);
      });
    });
  }
}
