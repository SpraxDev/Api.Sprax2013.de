import * as PrismaClient from '@prisma/client';
import { singleton } from 'tsyringe';
import MinecraftProfileCache from '../../../minecraft/profile/MinecraftProfileCache.js';
import MinecraftProfileService from '../../../minecraft/profile/MinecraftProfileService.js';
import PayloadProcessor from './PayloadProcessor.js';

@singleton()
export default class UsernameProcessor implements PayloadProcessor {
  constructor(
    private readonly minecraftProfileService: MinecraftProfileService,
    private readonly minecraftProfileCache: MinecraftProfileCache,
  ) {
  }

  async process(task: PrismaClient.ImportTask): Promise<boolean> {
    const username = task.payload.toString();
    if (!this.isValidUsername(username)) {
      throw new Error(`invalid username: ${JSON.stringify(username)}`);
    }

    const knownProfile = await this.minecraftProfileCache.findByUsername(username);
    const importedProfile = await this.minecraftProfileService.provideProfileByUsername(username);

    return importedProfile != null && knownProfile?.profile.id !== importedProfile.profile.id;
  }

  private isValidUsername(username: string): boolean {
    return /^[a-z0-9-_]{1,16}$/i.test(username);
  }
}
