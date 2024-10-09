import { singleton } from 'tsyringe';
import DatabaseClient from '../database/DatabaseClient.js';
import { UuidToProfileResponse } from '../minecraft/MinecraftApiClient.js';
import MinecraftSkinCache from '../minecraft/skin/MinecraftSkinCache.js';
import MinecraftProfile from '../minecraft/value-objects/MinecraftProfile.js';
import SentrySdk from '../SentrySdk.js';

@singleton()
export default class LazyImportTaskCreator {
  private readonly danglingPromises = new Set<Promise<void>>();

  constructor(
    private readonly databaseClient: DatabaseClient,
    private readonly minecraftSkinCache: MinecraftSkinCache
  ) {
  }

  queueProfileUpdate(uuidToProfile: UuidToProfileResponse): void {
    const profile = new MinecraftProfile(uuidToProfile);

    this.trackPromise(this.queueSkinUpdate(profile));
    // TODO: queue updating capes
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
}
