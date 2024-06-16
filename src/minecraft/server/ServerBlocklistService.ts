import Crypto from 'node:crypto';
import Net from 'node:net';
import Url from 'node:url';
import { singleton } from 'tsyringe';
import DatabaseClient from '../../database/DatabaseClient.js';
import FqdnValidator from './FqdnValidator.js';
import ServerBlocklistPersister from './ServerBlocklistPersister.js';

export class InvalidHostError extends Error {
  constructor() {
    super('Expected host to be either an IPv4 address, an IPv6 address or a valid Fully Qualified Domain Name (FQDN)');
  }
}

@singleton()
export default class ServerBlocklistService {
  constructor(
    private readonly fqdnService: FqdnValidator,
    private readonly databaseClient: DatabaseClient,
    private readonly serverBlocklistPersister: ServerBlocklistPersister
  ) {
  }

  async provideBlocklist(): Promise<string[]> {
    return (await this.databaseClient.serverBlocklist.findMany({ select: { sha1: true } }))
      .map(blocklistEntry => blocklistEntry.sha1.toString('hex'));
  }

  async provideBlocklistForKnownHosts(): Promise<{ sha1: Buffer, host: string | null }[]> {
    return this.databaseClient.serverBlocklist.findMany({ where: { host: { not: null } } });
  }

  async checkBlocklist(host: string): Promise<Map<string, boolean>> {
    host = this.normalizeHost(host);

    let hashesToCheck: Map<string, string>;
    let additionalHostsToCheck: Map<string, string> | null = null;
    if (Net.isIPv4(host)) {
      hashesToCheck = this.determineHostHashesForIp4(host);
    } else if (Net.isIPv6(host)) {
      hashesToCheck = new Map([this.hashHost(host)]);
    } else {
      const fqdn = Url.domainToASCII(host);
      if (!this.fqdnService.validateFqdn(fqdn)) {
        throw new InvalidHostError();
      }

      hashesToCheck = this.determineHostHashesForFqdn(fqdn);
      additionalHostsToCheck = this.determineAdditionalHostHashesForFqdn(fqdn);
    }

    const effectiveHostsToCheck = new Map([...hashesToCheck, ...(additionalHostsToCheck ?? [])]);

    const blocklist = await this.provideBlocklist();
    const result = new Map<string, boolean>();
    let atLeastOneHostIsBlocked = false;
    for (const [hostToCheck, hash] of effectiveHostsToCheck) {
      const hostBlocked = blocklist.includes(hash);
      if (hostBlocked) {
        atLeastOneHostIsBlocked = true;
      }

      if (hashesToCheck.has(hostToCheck)) {
        result.set(hostToCheck, hostBlocked);
      }
    }

    const newHostHashesPersisted = await this.persistHostHashes(effectiveHostsToCheck);
    if (newHostHashesPersisted && atLeastOneHostIsBlocked) {
      await this.serverBlocklistPersister.updateMaterializedView();
    }

    return result;
  }

  private async persistHostHashes(hostHashes: Map<string, string>): Promise<boolean> {
    return this.databaseClient.$transaction(async (transaction) => {
      const persistedHosts = (await transaction.serverBlocklistHostHashes.findMany({
        where: { sha1: { in: Array.from(hostHashes.values()).map(v => Buffer.from(v, 'hex')) } },
        select: { host: true }
      }))
        .map(hostHash => hostHash.host);

      const hostsToPersist = Array.from(hostHashes.keys()).filter(host => !persistedHosts.includes(host));
      if (hostsToPersist.length <= 0) {
        return false;
      }

      await transaction.serverBlocklistHostHashes.createMany({
        data: hostsToPersist.map(host => ({
          sha1: Buffer.from(hostHashes.get(host)!, 'hex'),
          host
        }))
      });
      return true;
    });
  }

  private determineHostHashesForIp4(host: string): Map<string, string> {
    const hostHashes = new Map<string, string>();

    let currentHost = host;
    hostHashes.set(...this.hashHost(currentHost));

    while (currentHost.lastIndexOf('.') !== -1) {
      currentHost = currentHost.substring(0, currentHost.lastIndexOf('.'));
      hostHashes.set(...this.hashHost(`${currentHost}.*`));
    }
    return hostHashes;
  }

  private determineHostHashesForFqdn(host: string): Map<string, string> {
    const hostHashes = new Map<string, string>();

    let currentHost = host;
    hostHashes.set(...this.hashHost(currentHost));
    hostHashes.set(...this.hashHost(`*.${currentHost}`));

    while (currentHost.indexOf('.') !== -1) {
      currentHost = currentHost.substring(currentHost.indexOf('.') + 1);
      hostHashes.set(...this.hashHost(`*.${currentHost}`));
    }
    return hostHashes;
  }

  private determineAdditionalHostHashesForFqdn(fqdn: string): Map<string, string> {
    const hosts = [
      `www.${fqdn}`,
      `play.${fqdn}`,
      `mc.${fqdn}`,
      `minecraft.${fqdn}`,
      `eu.${fqdn}`,
      `us.${fqdn}`
    ];

    const result = new Map<string, string>();
    for (const host of hosts) {
      result.set(...this.hashHost(host));
      result.set(...this.hashHost(`*.${host}`));
    }
    return result;
  }

  private hashHost(host: string): [string, string] {
    const hash = Crypto.createHash('sha1');
    hash.update(host.toLowerCase());  // Node.js uses UTF-8 here, but the Minecraft client actually uses ISO-8859-1
    return [host, hash.digest('hex')];
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
