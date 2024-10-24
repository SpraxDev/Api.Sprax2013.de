import { singleton } from 'tsyringe';
import DatabaseClient from '../../../database/DatabaseClient.js';
import type { UuidToProfileResponse } from '../../MinecraftApiClient.js';

@singleton()
export default class ProfilePersister {
  constructor(
    private readonly databaseClient: DatabaseClient
  ) {
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
  }

  async persistProfileAsDeleted(profileId: string): Promise<void> {
    await this.databaseClient.profile.update({
      where: { id: profileId },
      data: { deleted: true },
      select: { id: true }
    });
  }
}
