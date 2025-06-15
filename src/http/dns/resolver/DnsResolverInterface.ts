import type Dns from 'node:dns';

export type LookupAsyncResult = {
  address: string | Dns.LookupAddress[],
  family?: number,
}

export default interface DnsResolverInterface {
  lookup(
    hostname: string,
    options: Dns.LookupOptions,
    callback: (err: NodeJS.ErrnoException | null, address: string | Dns.LookupAddress[], family?: number) => void,
  ): void;

  lookupAsync(hostname: string, options: Dns.LookupOptions): Promise<LookupAsyncResult>;
}
