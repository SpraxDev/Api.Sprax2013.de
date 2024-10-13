import { singleton } from 'tsyringe';
import LazyImportTaskCreator from '../../import_queue/LazyImportTaskCreator.js';
import SentrySdk from '../../SentrySdk.js';
import UUID from '../../util/UUID.js';
import MinecraftApiClient, { UsernameToUuidResponse, type UuidToProfileResponse } from '../MinecraftApiClient.js';
import SetWithTtl from '../SetWithTtl.js';
import MinecraftProfileCache from './MinecraftProfileCache.js';

export type Profile = {
  profile: UuidToProfileResponse;
  ageInSeconds: number;
}

@singleton()
export default class MinecraftProfileService {
  private readonly nullProfileCache = SetWithTtl.create<string>(60);
  private readonly inFlightRequests = new Map<string, Promise<Profile | null>>();

  constructor(
    private readonly profileCache: MinecraftProfileCache,
    private readonly minecraftApiClient: MinecraftApiClient,
    private readonly lazyImportTaskCreator: LazyImportTaskCreator
  ) {
  }

  async provideProfileByUuid(uuid: string): Promise<Profile | null> {
    uuid = UUID.normalize(uuid);
    if (this.nullProfileCache.has(uuid)) {
      return null;
    }

    const inFlightKey = `u.${uuid}`;
    if (this.inFlightRequests.has(inFlightKey)) {
      return await this.inFlightRequests.get(inFlightKey)!;
    }

    try {
      const task = this.executeLookupByUuid(uuid);
      this.inFlightRequests.set(inFlightKey, task);
      return await task;
    } finally {
      this.inFlightRequests.delete(inFlightKey);
    }
  }

  async provideProfileByUsername(username: string): Promise<Profile | null> {
    if (this.nullProfileCache.has(username.toLowerCase())) {
      return null;
    }

    const inFlightKey = `n.${username.toLowerCase()}`;
    if (this.inFlightRequests.has(inFlightKey)) {
      return await this.inFlightRequests.get(inFlightKey)!;
    }

    try {
      const task = this.executeLookupByUsername(username);
      this.inFlightRequests.set(inFlightKey, task);
      return await task;
    } finally {
      this.inFlightRequests.delete(inFlightKey);
    }
  }

  private async executeLookupByUuid(uuid: string): Promise<Profile | null> {
    const profileInDatabase = await this.profileCache.findByUuid(uuid);
    if (profileInDatabase != null && profileInDatabase.ageInSeconds <= 60) {
      return profileInDatabase;
    }

    let profile;
    try {
      profile = await this.minecraftApiClient.fetchProfileForUuid(uuid);
    } catch (err: any) {
      if (profileInDatabase != null && profileInDatabase.ageInSeconds <= 10 * 60) {
        SentrySdk.captureError(err);
        return profileInDatabase;
      }
      throw err;
    }

    if (profile == null) {
      this.nullProfileCache.add(uuid.toLowerCase());
      if (profileInDatabase != null) {
        await this.profileCache.persistProfileAsDeleted(profileInDatabase.profile.id);
      }

      return null;
    }

    await this.profileCache.persist(profile);
    this.lazyImportTaskCreator.queueProfileUpdate(profile);

    return {
      profile,
      ageInSeconds: 0
    };
  }

  private async executeLookupByUsername(username: string): Promise<Profile | null> {
    const profileInDatabase = await this.profileCache.findByUsername(username);
    if (profileInDatabase != null && profileInDatabase.ageInSeconds <= 60) {
      return profileInDatabase;
    }

    if (profileInDatabase != null) {
      const profileCandidate = await this.executeLookupByUuid(profileInDatabase.profile.id);
      if (profileCandidate != null && profileCandidate.profile.name === profileInDatabase.profile.name) {
        return profileCandidate;
      }
    }

    let resolvedUuid: UsernameToUuidResponse | null;
    try {
      resolvedUuid = await this.minecraftApiClient.fetchUuidForUsername(username);
    } catch (err: any) {
      if (profileInDatabase != null && profileInDatabase.ageInSeconds <= 10 * 60) {
        SentrySdk.captureError(err);
        return profileInDatabase;
      }
      throw err;
    }

    if (resolvedUuid == null) {
      this.nullProfileCache.add(username.toLowerCase());
      return null;
    }

    return this.provideProfileByUuid(resolvedUuid.id);
  }
}
