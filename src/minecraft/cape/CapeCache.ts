import * as PrismaClient from '@prisma/client';
import { singleton } from 'tsyringe';
import DatabaseClient from '../../database/DatabaseClient.js';

export type CachedProfileCape = {
  lastSeenUsing: Date;
  cape: PrismaClient.Cape;
}

@singleton()
export default class CapeCache {
  constructor(
    private readonly databaseClient: DatabaseClient
  ) {
  }

  async findByProfileAndType(profileId: string, capeType: PrismaClient.CapeType): Promise<CachedProfileCape | null> {
    const cape = await this.databaseClient.profileSeenCape.findFirst({
      where: {
        profileId,
        cape: { type: capeType }
      },
      select: {
        lastSeenUsing: true,
        cape: true
      },
      orderBy: { lastSeenUsing: 'desc' }
    });
    return cape ?? null;
  }

  async findIdByTypeAndUrl(capeType: PrismaClient.CapeType, capeUrl: string): Promise<bigint | null> {
    const cape = await this.databaseClient.capeUrl.findUnique({
      where: { url: capeUrl, cape: { type: capeType } },
      select: { capeId: true }
    });
    return cape?.capeId ?? null;
  }

  async findByTypeAndUrl(capeType: PrismaClient.CapeType, capeUrl: string): Promise<PrismaClient.Cape | null> {
    const cape = await this.databaseClient.capeUrl.findUnique({
      where: { url: capeUrl, cape: { type: capeType } },
      select: { cape: true }
    });
    return cape?.cape ?? null;
  }
}
