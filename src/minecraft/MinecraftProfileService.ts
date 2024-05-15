import { singleton } from 'tsyringe';
import DatabaseClient from '../database/DatabaseClient.js';
import SentrySdk from '../SentrySdk.js';
import MinecraftApiClient, { UuidToProfileResponse } from './MinecraftApiClient.js';
import SetWithTTL from './SetWithTTL.js';

export type Profile = {
  profile: UuidToProfileResponse;
  ageInSeconds: number;
}

@singleton()
export default class MinecraftProfileService {
  private readonly nullProfileCache = new SetWithTTL<string>(60);

  constructor(
    private readonly minecraftApiClient: MinecraftApiClient,
    private readonly databaseClient: DatabaseClient
  ) {
  }

  async provideProfile(uuid: string): Promise<Profile | null> {
    if (this.nullProfileCache.has(uuid.toLowerCase())) {
      return null;
    }

    const profileInDatabase = await this.findProfileInDatabase(uuid);
    if (profileInDatabase != null && profileInDatabase.ageInSeconds <= 60) {
      return profileInDatabase;
    }

    let profile;
    try {
      profile = await this.minecraftApiClient.fetchProfileForUuid(uuid);
    } catch (err: any) {
      if (profileInDatabase != null && profileInDatabase.ageInSeconds <= 5 * 60) {
        SentrySdk.captureError(err);
        return profileInDatabase;
      }
      throw err;
    }

    if (profile == null) {
      this.nullProfileCache.add(uuid.toLowerCase());
      return null;
    }

    await this.persistProfileInDatabase(profile);
    return {
      profile,
      ageInSeconds: 0
    };
  }

  private async persistProfileInDatabase(profile: UuidToProfileResponse): Promise<void> {
    await this.databaseClient.profile.upsert({
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
  }

  private async findProfileInDatabase(uuid: string): Promise<Profile | null> {
    const profile = await this.databaseClient.profileCache.findUnique({
      select: {
        raw: true,
        ageInSeconds: true
      },
      where: {
        id: uuid
      }
    });
    if (profile == null) {
      return null;
    }

    return {
      profile: profile.raw as UuidToProfileResponse,
      ageInSeconds: profile.ageInSeconds
    };
  }
}
