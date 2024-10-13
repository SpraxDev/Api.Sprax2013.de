import { singleton } from 'tsyringe';
import SentrySdk from '../../util/SentrySdk.js';
import MinecraftProfile from '../value-objects/MinecraftProfile.js';
import CapeCache from './CapeCache.js';
import { CapeType } from './CapeType.js';
import { CapeResponse } from './provider/CapeProvider.js';
import UserCapeProvider from './UserCapeProvider.js';

@singleton()
export default class UserCapeService {
  private readonly inFlightRequests = new Map<string, Promise<CapeResponse | null>>();

  constructor(
    private readonly capeCache: CapeCache,
    private readonly userCapeProvider: UserCapeProvider
  ) {
  }

  async provide(profile: MinecraftProfile, type: CapeType): Promise<CapeResponse | null> {
    const inFlightKey = `${profile.id}.${type}`;
    if (this.inFlightRequests.has(inFlightKey)) {
      return await this.inFlightRequests.get(inFlightKey)!;
    }

    try {
      const task = this.executeProvide(profile, type);
      this.inFlightRequests.set(inFlightKey, task);
      return await task;
    } finally {
      this.inFlightRequests.delete(inFlightKey);
    }
  }

  private async executeProvide(profile: MinecraftProfile, type: CapeType): Promise<CapeResponse | null> {
    const cachedCape = await this.capeCache.findByProfileAndType(profile.id, type);
    const cacheAgeInSeconds = cachedCape == null ? 0 : (Date.now() - cachedCape.lastSeenUsing.getTime()) / 1000;
    if (cachedCape != null && cacheAgeInSeconds <= 60) {
      return {
        image: cachedCape.cape.imageBytes,
        mimeType: cachedCape.cape.mimeType,
        ageInSeconds: cacheAgeInSeconds
      };
    }

    let cape: CapeResponse | null;
    try {
      cape = await this.userCapeProvider.provide(profile, type);
    } catch (err: any) {
      if (cachedCape != null && cacheAgeInSeconds <= 10 * 60) {
        SentrySdk.captureError(err);
        return {
          image: cachedCape.cape.imageBytes,
          mimeType: cachedCape.cape.mimeType,
          ageInSeconds: cacheAgeInSeconds
        };
      }
      throw err;
    }

    if (cape != null) {
      if (type === CapeType.MOJANG) {
        await this.capeCache.persistMojangCape(cape.image, profile.getTexturesProperty()!);
      } else {
        await this.capeCache.persistGenericCape(type, cape.image, cape.mimeType, profile.id);
      }

      return {
        image: cape.image,
        mimeType: cape.mimeType,
        ageInSeconds: cacheAgeInSeconds
      };
    }

    return null;
  }
}
