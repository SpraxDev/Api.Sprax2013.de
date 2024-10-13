import * as PrismaClient from '@prisma/client';
import { singleton } from 'tsyringe';
import MinecraftProfileCache from '../../../minecraft/profile/MinecraftProfileCache.js';
import MinecraftProfileService from '../../../minecraft/profile/MinecraftProfileService.js';
import PayloadProcessor from './PayloadProcessor.js';

@singleton()
export default class UuidProcessor implements PayloadProcessor {
  constructor(
    private readonly minecraftProfileService: MinecraftProfileService,
    private readonly minecraftProfileCache: MinecraftProfileCache
  ) {
  }

  async process(task: PrismaClient.ImportTask | string): Promise<boolean> {
    const uuid = typeof task === 'string' ? task : task.payload.toString();
    if (uuid.length !== 32) {
      throw new Error('Invalid UUID (hyphens are not allowed)');
    }

    const alreadyKnowUuid = await this.minecraftProfileCache.findByUuid(uuid) != null;

    const profile = await this.minecraftProfileService.provideProfileByUuid(uuid);
    return !alreadyKnowUuid && profile != null;
  }
}
