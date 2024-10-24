import { singleton } from 'tsyringe';
import DatabaseClient from '../../database/DatabaseClient.js';
import type { UuidToProfileResponse } from '../MinecraftApiClient.js';
import MinecraftSkinCache from '../skin/MinecraftSkinCache.js';
import MinecraftProfile from '../value-objects/MinecraftProfile.js';
import MinecraftProfileTextures from '../value-objects/MinecraftProfileTextures.js';
import { Profile } from './MinecraftProfileService.js';

@singleton()
export default class MinecraftProfileCache {
  constructor(
    private readonly databaseClient: DatabaseClient,
    private readonly minecraftSkinCache: MinecraftSkinCache
  ) {
  }

  async findByUuid(uuid: string): Promise<Profile | null> {
    const profile = await this.databaseClient.profileCache.findUnique({
      select: {
        raw: true,
        ageInSeconds: true
      },
      where: { id: uuid }
    });

    if (profile == null) {
      return null;
    }
    return {
      profile: profile.raw as UuidToProfileResponse,
      ageInSeconds: profile.ageInSeconds
    };
  }

  async findByUsername(username: string): Promise<Profile | null> {
    const profile = await this.databaseClient.profileCache.findFirst({
      select: {
        raw: true,
        ageInSeconds: true
      },
      where: { nameLowercase: username.toLowerCase() },
      orderBy: { ageInSeconds: 'asc' }
    });

    if (profile == null) {
      return null;
    }
    return {
      profile: profile.raw as UuidToProfileResponse,
      ageInSeconds: profile.ageInSeconds
    };
  }

  async persist(profile: UuidToProfileResponse): Promise<void> {
    await this.databaseClient.profile.upsert({
      select: { id: true },
      where: { id: profile.id },
      create: {
        id: profile.id,
        nameLowercase: profile.name.toLowerCase(),
        raw: profile
      },
      update: {
        nameLowercase: profile.name.toLowerCase(),
        raw: profile,
        deleted: false
      }
    });

    const textureProperty = new MinecraftProfile(profile).getTexturesProperty();
    if (textureProperty?.value != null) {
      const parsedTextures = MinecraftProfileTextures.fromPropertyValue(textureProperty.value);

      const existingNameHistoryEntry = await this.databaseClient.profileSeenNames.findUnique({
        where: {
          profileId_nameLowercase: {
            profileId: profile.id,
            nameLowercase: profile.name.toLowerCase()
          }
        },
        select: { firstSeen: true, lastSeen: true }
      });
      const updateNameHistoryEntry = existingNameHistoryEntry == null || existingNameHistoryEntry.lastSeen < parsedTextures.timestamp;
      const overrideNameFirstSeenUsing = existingNameHistoryEntry != null && existingNameHistoryEntry.firstSeen > parsedTextures.timestamp;

      if (updateNameHistoryEntry) {
        await this.databaseClient.profileSeenNames.upsert({
          where: {
            profileId_nameLowercase: {
              profileId: profile.id,
              nameLowercase: profile.name.toLowerCase()
            }
          },
          create: {
            profileId: profile.id,
            nameLowercase: profile.name.toLowerCase(),
            firstSeen: parsedTextures.timestamp,
            lastSeen: parsedTextures.timestamp
          },
          update: {
            firstSeen: overrideNameFirstSeenUsing ? parsedTextures.timestamp : undefined,
            lastSeen: parsedTextures.timestamp
          }
        });
      }
    }

    await this.minecraftSkinCache.persistSkinHistory(new MinecraftProfile(profile));
  }

  async persistProfileAsDeleted(profileId: string): Promise<void> {
    await this.databaseClient.profile.update({
      where: { id: profileId },
      data: { deleted: true },
      select: { id: true }
    });
  }
}
