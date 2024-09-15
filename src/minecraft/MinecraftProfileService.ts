import { singleton } from 'tsyringe';
import DatabaseClient from '../database/DatabaseClient.js';
import SentrySdk from '../SentrySdk.js';
import MinecraftApiClient, { type UuidToProfileResponse } from './MinecraftApiClient.js';
import SetWithTtl from './SetWithTtl.js';

export type Profile = {
  profile: UuidToProfileResponse;
  ageInSeconds: number;
}

@singleton()
export default class MinecraftProfileService {
  private readonly nullProfileCache = SetWithTtl.create<string>(60);

  constructor(
    private readonly minecraftApiClient: MinecraftApiClient,
    private readonly databaseClient: DatabaseClient
  ) {
  }

  async provideProfileByUsername(username: string): Promise<Profile | null> {
    if (this.nullProfileCache.has(username.toLowerCase())) {
      return null;
    }

    const profileInDatabase = await this.findProfileInDatabaseForUsername(username);
    if (profileInDatabase != null && profileInDatabase.ageInSeconds <= 60) {
      return profileInDatabase;
    }

    let uuid;
    try {
      uuid = await this.minecraftApiClient.fetchUuidForUsername(username);
    } catch (err: any) {
      if (profileInDatabase != null && profileInDatabase.ageInSeconds <= 5 * 60) {
        SentrySdk.captureError(err);
        return profileInDatabase;
      }
      throw err;
    }

    if (uuid == null) {
      this.nullProfileCache.add(username.toLowerCase());
      return null;
    }

    return this.provideProfileByUuid(uuid.id);
  }

  async provideProfileByUuid(uuid: string): Promise<Profile | null> {
    if (this.nullProfileCache.has(uuid.toLowerCase())) {
      return null;
    }

    const profileInDatabase = await this.findProfileInDatabaseForUuid(uuid);
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

  private async findProfileInDatabaseForUuid(uuid: string): Promise<Profile | null> {
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

  private async findProfileInDatabaseForUsername(username: string): Promise<Profile | null> {
    const profile = await this.databaseClient.profileCache.findFirst({
      select: {
        raw: true,
        ageInSeconds: true
      },
      where: {
        nameLowercase: username.toLowerCase()
      },
      orderBy: {
        ageInSeconds: 'asc'
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
