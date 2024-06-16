import Crypto from 'node:crypto';
import Net from 'node:net';
import Url from 'node:url';
import { singleton } from 'tsyringe';
import MinecraftApiClient from '../MinecraftApiClient.js';
import FqdnValidator from './FqdnValidator.js';

export class InvalidHostError extends Error {
  constructor() {
    super('Expected host to be either an IPv4 address, an IPv6 address or a valid Fully Qualified Domain Name (FQDN)');
  }
}

@singleton()
export default class ServerBlocklistService {
  constructor(
    private readonly minecraftApiClient: MinecraftApiClient,
    private readonly fqdnService: FqdnValidator
  ) {
  }

  async provideBlocklist(): Promise<string[]> {
    return this.minecraftApiClient.fetchListOfBlockedServers();
  }

  async checkBlocklist(host: string): Promise<Map<string, boolean>> {
    host = this.normalizeHost(host);

    let hashesToCheck: Map<string, string>;
    if (Net.isIPv4(host)) {
      hashesToCheck = this.determineHostHashesForIp4(host);
    } else if (Net.isIPv6(host)) {
      hashesToCheck = new Map<string, string>([[host, this.hashHost(host)]]);
    } else {
      const fqdn = Url.domainToASCII(host);
      if (!this.fqdnService.validateFqdn(fqdn)) {
        throw new InvalidHostError();
      }

      hashesToCheck = this.determineHostHashesForFqdn(fqdn);
    }

    const blocklist = await this.provideBlocklist();
    const result = new Map<string, boolean>();
    for (const [hostToCheck, hash] of hashesToCheck) {
      result.set(hostToCheck, blocklist.includes(hash));
    }
    return result;
  }

  private determineHostHashesForIp4(host: string): Map<string, string> {
    const hostHashes = new Map<string, string>();

    let currentHost = host;
    hostHashes.set(currentHost, this.hashHost(currentHost));

    while (currentHost.lastIndexOf('.') !== -1) {
      currentHost = currentHost.substring(0, currentHost.lastIndexOf('.'));
      hostHashes.set(`${currentHost}.*`, this.hashHost(`${currentHost}.*`));
    }
    return hostHashes;
  }

  private determineHostHashesForFqdn(host: string): Map<string, string> {
    const hostHashes = new Map<string, string>();

    let currentHost = host;
    hostHashes.set(currentHost, this.hashHost(currentHost));
    hostHashes.set(`*.${currentHost}`, this.hashHost(`*.${currentHost}`));

    while (currentHost.indexOf('.') !== -1) {
      currentHost = currentHost.substring(currentHost.indexOf('.') + 1);
      hostHashes.set(`*.${currentHost}`, this.hashHost(`*.${currentHost}`));
    }
    return hostHashes;
  }

  private hashHost(host: string): string {
    const hash = Crypto.createHash('sha1');
    hash.update(host.toLowerCase());  // Node.js uses UTF-8 here, but the Minecraft client actually uses ISO-8859-1
    return hash.digest('hex');
  }

  private normalizeHost(host: string): string {
    while (host.endsWith('.')) {
      host = host.substring(0, host.length - 1);
    }
    if (host.lastIndexOf(':') !== -1) {
      const port = host.substring(host.lastIndexOf(':') + 1);
      if (/^\d+$/.test(port)) {
        host = host.substring(0, host.lastIndexOf(':'));
      }
    }
    return host;
  }
}
