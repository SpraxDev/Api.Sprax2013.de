import Dns from 'node:dns';
import { singleton } from 'tsyringe';
import DnsResolverInterface, { type LookupAsyncResult } from './DnsResolverInterface.js';

@singleton()
export default class DnsResolver implements DnsResolverInterface {
  lookup(
    hostname: string,
    options: Dns.LookupOptions,
    callback: (err: NodeJS.ErrnoException | null, address: string | Dns.LookupAddress[], family?: number) => void,
  ): void {
    Dns.lookup(hostname, options, (err, address, family): void => {
      return callback(err, address, family);
    });
  }

  lookupAsync(hostname: string, options: Dns.LookupOptions): Promise<LookupAsyncResult> {
    return new Promise((resolve, reject) => {
      this.lookup(hostname, options, (err, address, family): void => {
        if (err) {
          return reject(err);
        }
        resolve({ address, family });
      });
    });
  }
}
