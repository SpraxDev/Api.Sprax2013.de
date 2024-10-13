import * as PrismaClient from '@prisma/client';
import { singleton } from 'tsyringe';
import { CAPE_TYPE_STRINGS, CapeType } from '../../../minecraft/cape/CapeType.js';
import UserCapeService from '../../../minecraft/cape/UserCapeService.js';
import MinecraftProfileService from '../../../minecraft/profile/MinecraftProfileService.js';
import MinecraftProfile from '../../../minecraft/value-objects/MinecraftProfile.js';
import PayloadProcessor from './PayloadProcessor.js';

@singleton()
export default class UpdateThirdPartyCapesProcessor implements PayloadProcessor {
  constructor(
    private readonly minecraftProfileService: MinecraftProfileService,
    private readonly capeService: UserCapeService
  ) {
  }

  async process(task: PrismaClient.ImportTask): Promise<boolean> {
    const uuid = task.payload.toString();
    if (uuid.length !== 32) {
      throw new Error('Invalid UUID (hyphens are not allowed)');
    }

    const profile = await this.minecraftProfileService.provideProfileByUuid(uuid);
    if (profile == null) {
      throw new Error('No profile for the given UUID found');
    }

    const promises: Promise<any>[] = [];
    for (const capeType of CAPE_TYPE_STRINGS) {
      if (capeType !== CapeType.MOJANG) {
        promises.push(this.capeService.provide(new MinecraftProfile(profile.profile), capeType as CapeType));
      }
    }
    await Promise.all(promises);

    return true;
  }
}
