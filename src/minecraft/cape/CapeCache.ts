import * as PrismaClient from '@prisma/client';
import Crypto from 'node:crypto';
import { singleton } from 'tsyringe';
import DatabaseClient from '../../database/DatabaseClient.js';
import { UuidToProfileResponse } from '../MinecraftApiClient.js';
import MinecraftProfileTextures from '../value-objects/MinecraftProfileTextures.js';

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

  async findByTypeAndUrl(capeType: PrismaClient.CapeType, capeUrl: string): Promise<PrismaClient.Cape | null> {
    const cape = await this.databaseClient.capeUrl.findUnique({
      where: { url: capeUrl, cape: { type: capeType } },
      select: { cape: true }
    });
    return cape?.cape ?? null;
  }

  async persistMojangCape(capeBytes: Buffer, textureProperty: UuidToProfileResponse['properties'][0]): Promise<void> {
    const parsedTextures = MinecraftProfileTextures.fromPropertyValue(textureProperty.value);
    const capeUrl = parsedTextures.getSecureCapeUrl();
    if (capeUrl == null) {
      throw new Error('Cannot persist cape: capeUrl is null');
    }

    const imageSha256 = this.computeSha256(capeBytes);
    await this.databaseClient.$transaction(async (transaction) => {
      let existingCape = await transaction.cape.findUnique({
        where: { type_imageSha256: { type: 'MOJANG', imageSha256: imageSha256 } },
        select: { id: true, capeUrls: true }
      });

      if (existingCape == null) {
        existingCape = await transaction.cape.create({
          data: {
            type: 'MOJANG',
            imageSha256,
            imageBytes: capeBytes,
            mimeType: 'image/png',
            capeUrls: {
              connectOrCreate: {
                where: { url: capeUrl },
                create: { url: capeUrl }
              }
            }
          },
          select: { id: true, capeUrls: true }
        });
      }

      if (existingCape.capeUrls.length === 0) {
        await transaction.capeUrl.create({
          data: { url: capeUrl, capeId: existingCape.id }
        });
      }

      const existingHistoryEntry = await transaction.profileSeenCape.findUnique({
        where: {
          profileId_capeId: {
            profileId: parsedTextures.profileId,
            capeId: existingCape.id
          }
        },
        select: { firstSeenUsing: true, lastSeenUsing: true }
      });
      const updateHistoryEntry = existingHistoryEntry == null || existingHistoryEntry.lastSeenUsing < parsedTextures.timestamp;
      const overrideFirstSeenUsing = existingHistoryEntry != null && existingHistoryEntry.firstSeenUsing > parsedTextures.timestamp;

      if (updateHistoryEntry) {
        await transaction.profileSeenCape.upsert({
          where: {
            profileId_capeId: {
              profileId: parsedTextures.profileId,
              capeId: existingCape.id
            }
          },
          create: {
            profileId: parsedTextures.profileId,
            capeId: existingCape.id,
            firstSeenUsing: parsedTextures.timestamp,
            lastSeenUsing: parsedTextures.timestamp
          },
          update: {
            firstSeenUsing: overrideFirstSeenUsing ? parsedTextures.timestamp : undefined,
            lastSeenUsing: parsedTextures.timestamp
          }
        });
      }
    });
  }

  async persistGenericCape(
    type: PrismaClient.CapeType,
    capeBytes: Buffer,
    mimeType: string,
    profileIdSeenWithCapeJustNow: string | null
  ): Promise<void> {
    const imageSha256 = this.computeSha256(capeBytes);
    await this.databaseClient.$transaction(async (transaction) => {
      let existingCape = await transaction.cape.findUnique({
        where: { type_imageSha256: { type, imageSha256: imageSha256 } },
        select: { id: true, capeUrls: true }
      });

      if (existingCape == null) {
        existingCape = await transaction.cape.create({
          data: {
            type,
            imageSha256,
            imageBytes: capeBytes,
            mimeType
          },
          select: { id: true, capeUrls: true }
        });
      }

      if (profileIdSeenWithCapeJustNow == null) {
        return;
      }

      await transaction.profileSeenCape.upsert({
        where: {
          profileId_capeId: {
            profileId: profileIdSeenWithCapeJustNow,
            capeId: existingCape.id
          }
        },
        create: {
          profileId: profileIdSeenWithCapeJustNow,
          capeId: existingCape.id
        },
        update: {
          lastSeenUsing: await this.databaseClient.fetchNow()
        }
      });
    });
  }

  private computeSha256(buffer: Buffer): Buffer {
    return Crypto
      .createHash('sha256')
      .update(buffer)
      .digest();
  }
}
