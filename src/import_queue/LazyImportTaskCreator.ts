import { singleton } from 'tsyringe';
import DatabaseClient from '../database/DatabaseClient.js';
import { UuidToProfileResponse } from '../minecraft/MinecraftApiClient.js';
import MinecraftSkinCache from '../minecraft/skin/MinecraftSkinCache.js';
import MinecraftProfile from '../minecraft/value-objects/MinecraftProfile.js';
import SentrySdk from '../util/SentrySdk.js';
import UUID from '../util/UUID.js';

@singleton()
export default class LazyImportTaskCreator {
  private readonly danglingPromises = new Set<Promise<void>>();

  constructor(
    private readonly databaseClient: DatabaseClient,
    private readonly minecraftSkinCache: MinecraftSkinCache
  ) {
  }

  queueUuidUpdate(uuid: string): void {
    this.trackPromise(this.queueUuid(uuid));
  }

  queueUsernameUpdate(username: string): void {
    this.trackPromise(this.queueUsername(username));
  }

  queueProfileUpdate(uuidToProfile: UuidToProfileResponse): void {
    const profile = new MinecraftProfile(uuidToProfile);

    this.trackPromise(this.queueSkinUpdate(profile));
    this.trackPromise(this.queueThirdPartyCapeUpdate(profile));
  }

  async waitForDanglingPromises(): Promise<void> {
    await Promise.all(Array.from(this.danglingPromises));
  }

  private trackPromise(promise: Promise<void>): void {
    this.danglingPromises.add(promise);

    promise
      .catch(SentrySdk.logAndCaptureError)
      .finally(() => this.danglingPromises.delete(promise));
  }

  private async queueUuid(uuid: string): Promise<void> {
    await this.databaseClient.importTask.createMany({
      data: [{
        payload: Buffer.from(UUID.normalize(uuid)),
        payloadType: 'UUID'
      }],
      skipDuplicates: true
    });
  }

  private async queueUsername(username: string): Promise<void> {
    await this.databaseClient.importTask.createMany({
      data: [{
        payload: Buffer.from(username.toLowerCase()),
        payloadType: 'USERNAME'
      }],
      skipDuplicates: true
    });
  }

  private async queueSkinUpdate(profile: MinecraftProfile): Promise<void> {
    const skinUrl = profile.parseTextures()?.getSecureSkinUrl();
    if (skinUrl == null || (await this.minecraftSkinCache.existsSkinUrlWithNonNullTextureValue(skinUrl))) {
      return;
    }

    await this.databaseClient.importTask.createMany({
      data: [{
        payload: Buffer.from(JSON.stringify({
          value: profile.getTexturesProperty()!['value'],
          signature: profile.getTexturesProperty()!['signature']
        })),
        payloadType: 'PROFILE_TEXTURE_VALUE'
      }],
      skipDuplicates: true
    });
  }

  private async queueThirdPartyCapeUpdate(profile: MinecraftProfile): Promise<void> {
    const payloadType = 'UUID_UPDATE_THIRD_PARTY_CAPES';
    const payload = Buffer.from(UUID.normalize(profile.id));

    const now = await this.databaseClient.fetchNow();
    await this.databaseClient.$transaction(async (transaction) => {
      await transaction.importTask.deleteMany({
        where: {
          payloadType,
          payload,
          state: { notIn: ['QUEUED', 'ERROR'] },
          stateUpdatedAt: { lt: new Date(now.getTime() - 60 * 60 * 1000 /* 1h */) }
        }
      });

      await transaction.importTask.createMany({
        data: [{ payloadType, payload }],
        skipDuplicates: true
      });
    });
  }
}
