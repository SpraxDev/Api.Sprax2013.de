import Crypto from 'node:crypto';
import { singleton } from 'tsyringe';
import DatabaseClient from '../../../database/DatabaseClient.js';
import ResolvedToNonUnicastIpError from '../../../http/dns/errors/ResolvedToNonUnicastIpError.js';
import SentrySdk from '../../../util/SentrySdk.js';
import SetWithTtl from '../../SetWithTtl.js';
import { PingResult } from './AbstractMinecraftServerPing.js';
import ServerStatusPingError from './error/ServerStatusPingError.js';
import MinecraftServerStatusPinger from './MinecraftServerStatusPinger.js';
import HostNotResolvableError from './resolve/HostNotResolvableError.js';

export type CachedServerStatus = {
  ageInSeconds: number;
  serverStatus: PingResult | null;
}

@singleton()
export default class MinecraftServerStatusService {
  private readonly offlineServerCache = SetWithTtl.create<string>(60);

  constructor(
    private readonly minecraftServerStatusPinger: MinecraftServerStatusPinger,
    private readonly databaseClient: DatabaseClient
  ) {
  }

  async provideServerStatus(host: string, port: number): Promise<CachedServerStatus> {
    const cacheKey = this.createCacheKey(host, port);
    if (this.offlineServerCache.has(cacheKey)) {
      return {
        ageInSeconds: this.offlineServerCache.getAgeInSeconds(cacheKey),
        serverStatus: null
      };
    }

    const cachedServerStatus = await this.fetchCachedServerStatusFromDatabase(host, port);
    if (cachedServerStatus != null) {
      return cachedServerStatus;
    }

    const serverStatus = await this.performServerStatusCheck(host, port);
    if (serverStatus == null) {
      this.offlineServerCache.add(cacheKey);
      return {
        ageInSeconds: 0,
        serverStatus: null
      }
    }

    await this.persistServerStatusInDatabase(serverStatus, host, port);
    return {
      ageInSeconds: 0,
      serverStatus
    };
  }

  private async performServerStatusCheck(host: string, port: number): Promise<PingResult | null> {
    try {
      return await this.minecraftServerStatusPinger.ping(host, port);
    } catch (err: any) {
      if (err instanceof ServerStatusPingError
        || err instanceof HostNotResolvableError
        || err instanceof ResolvedToNonUnicastIpError) {
        return null;
      }
      throw err;
    }
  }

  private async fetchCachedServerStatusFromDatabase(host: string, port: number): Promise<CachedServerStatus | null> {
    const serverStatus = await this.databaseClient.serverStatusCache.findFirst({
      where: {
        host,
        port,
        ageInSeconds: { lt: 30 }
      }
    });
    if (serverStatus == null) {
      return null;
    }

    return {
      serverStatus: {
        rttInMs: serverStatus.rttInMs,
        resolvedIp: serverStatus.resolvedIp,
        legacyPing: serverStatus.wasLegacyProtocol === true ? true : undefined,
        status: serverStatus.rawStatus as any
      },
      ageInSeconds: serverStatus.ageInSeconds
    };
  }

  private async persistServerStatusInDatabase(serverStatus: PingResult, host: string, port: number): Promise<void> {
    const parsedFavicon = serverStatus.status.favicon != null ? this.parseFavicon(serverStatus.status.favicon) : null;

    await this.databaseClient.serverStatusHistory.create({
      data: {
        host,
        port,
        rttInMs: serverStatus.rttInMs,
        resolvedIp: serverStatus.resolvedIp,
        wasLegacyProtocol: serverStatus.legacyPing ?? false,

        onlinePlayers: serverStatus.status.players?.online ?? 0,
        protocolVersion: serverStatus.status.version?.protocol ?? -1,
        rawStatus: serverStatus.status as any,

        favicon: parsedFavicon != null ? {
          connectOrCreate: {
            where: { sha256: parsedFavicon.dataSha256 },
            create: {
              sha256: parsedFavicon.dataSha256,
              image: parsedFavicon.data
            }
          }
        } : undefined
      }
    });
  }

  private parseFavicon(favicon: string): { dataSha256: Buffer, data: Buffer } | null {
    const prefix = 'data:image/png;base64,';
    if (!favicon.startsWith(prefix)) {
      SentrySdk.logAndCaptureWarning(`Persisted favicon does not start with expected prefix: ${prefix}`, { favicon });
      return null;
    }

    const data = Buffer.from(favicon.substring(prefix.length), 'base64');
    const dataSha256 = Crypto.createHash('sha256').update(data).digest();
    return { dataSha256, data };
  }

  private createCacheKey(host: string, port: number): string {
    return `${host}:${port}`;
  }
}
