import { singleton } from 'tsyringe';
import DatabaseClient from '../../database/DatabaseClient.js';
import type { UuidToProfileResponse } from '../MinecraftApiClient.js';
import MinecraftSkinCache from '../skin/MinecraftSkinCache.js';
import MinecraftProfile from '../value-objects/MinecraftProfile.js';
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

    await this.minecraftSkinCache.persistSkinHistory(new MinecraftProfile(profile));
  }
}
