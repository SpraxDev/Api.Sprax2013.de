import Crypto from 'node:crypto';
import Net from 'node:net';
import Url from 'node:url';
import { singleton } from 'tsyringe';
import DatabaseClient from '../../../database/DatabaseClient.js';
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
    private readonly serverBlocklistPersister: ServerBlocklistPersister,
  ) {
  }

  async provideBlocklist(): Promise<string[]> {
    return (await this.databaseClient.serverBlocklist.findMany({ select: { sha1: true } }))
      .map(blocklistEntry => blocklistEntry.sha1.toString('hex'));
  }

  async provideBlocklistForKnownHosts(): Promise<{ sha1: Buffer, host: string | null }[]> {
    return this.databaseClient.serverBlocklist.findMany({ where: { host: { not: null } } });
  }

  async checkBlocklist(host: string, dateSeenAt?: Date): Promise<Map<string, boolean>> {
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

    // FIXME: Die effectiveHostsToCheck-loop ist recht langsam :| – Wie bekommen wir die geiler hin? Ist new Set vllt. einfach teuer oder so?
    const blocklist = new Set(await this.provideBlocklist());
    const result = new Map<string, boolean>();
    let atLeastOneHostIsBlocked = false;
    for (const [hostToCheck, hash] of effectiveHostsToCheck) {
      const hostBlocked = blocklist.has(hash);
      if (hostBlocked) {
        atLeastOneHostIsBlocked = true;
      }

      if (hashesToCheck.has(hostToCheck)) {
        result.set(hostToCheck, hostBlocked);
      }
    }

    const newHostHashesPersisted = await this.persistHostHashes(effectiveHostsToCheck, dateSeenAt);
    if (newHostHashesPersisted && atLeastOneHostIsBlocked) {
      await this.serverBlocklistPersister.updateMaterializedView();
    }

    return result;
  }

  private async persistHostHashes(hostHashes: Map<string, string>, dateSeenAt?: Date): Promise<boolean> {
    const createResult = await this.databaseClient.serverBlocklistHostHashes.createMany({
      data: Array.from(hostHashes.entries())
        .map(([host, hash]) => ({
          host,
          sha1: Buffer.from(hash, 'hex'),
          createdAt: dateSeenAt,
        })),
      skipDuplicates: true,
    });
    return createResult.count > 0;
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
      if (currentHost.includes('.')) {
        hostHashes.set(...this.hashHost(`${currentHost}`));
      }
      hostHashes.set(...this.hashHost(`*.${currentHost}`));
    }
    return hostHashes;
  }

  private determineAdditionalHostHashesForFqdn(fqdn: string): Map<string, string> {
    const fqdnDotCount = fqdn.split('.').length - 1;
    if (fqdnDotCount > 3) {
      return new Map();
    }

    const hosts = [
      `play.${fqdn}`,
      `join.${fqdn}`,
      `mc.${fqdn}`,
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
    if (Net.isIPv6(host)) {
      return host;
    }

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
