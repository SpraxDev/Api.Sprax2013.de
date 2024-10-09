import * as PrismaClient from '@prisma/client';
import { singleton } from 'tsyringe';
import MinecraftApiClient from '../../../minecraft/MinecraftApiClient.js';
import MinecraftProfileCache from '../../../minecraft/profile/MinecraftProfileCache.js';
import MinecraftProfileService from '../../../minecraft/profile/MinecraftProfileService.js';
import PayloadProcessor from './PayloadProcessor.js';
import UuidProcessor from './UuidProcessor.js';

export type BulkProcessedUsername = {
  task: PrismaClient.ImportTask,
  result: boolean | Error
}

@singleton()
export default class UsernameProcessor implements PayloadProcessor {
  constructor(
    private readonly minecraftProfileService: MinecraftProfileService,
    private readonly minecraftProfileCache: MinecraftProfileCache,
    private readonly minecraftApiClient: MinecraftApiClient,
    private readonly uuidProcessor: UuidProcessor
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

  async processBulk(tasks: PrismaClient.ImportTask[]): Promise<BulkProcessedUsername[]> {
    const result: BulkProcessedUsername[] = [];

    const validTasksToLookUp: PrismaClient.ImportTask[] = [];
    for (const task of tasks) {
      const username = task.payload.toString();
      if (!this.isValidUsername(username)) {
        result.push({ task, result: new Error(`invalid username: ${JSON.stringify(username)}`) });
        continue;
      }

      const knownProfile = await this.minecraftProfileCache.findByUsername(username);
      if (knownProfile != null) {
        const importedProfile = await this.minecraftProfileService.provideProfileByUsername(username);

        const usernameImportResult = importedProfile != null && knownProfile?.profile.id !== importedProfile.profile.id;
        result.push({ task, result: usernameImportResult });
        continue;
      }

      validTasksToLookUp.push(task);
    }

    try {
      const usernames = validTasksToLookUp.map(task => task.payload.toString().toLowerCase());
      const bulkLookupResult = await this.minecraftApiClient.fetchBulkUuidForUsername(usernames);

      const usernamesNotFound = bulkLookupResult
        .filter(lookup => usernames.includes(lookup.name.toLowerCase()));
      for (const nonExistingUsername of usernamesNotFound) {
        const task = this.findTaskByUsername(validTasksToLookUp, nonExistingUsername.name);
        result.push({ task, result: false });
      }

      for (const lookupData of bulkLookupResult) {
        const task = this.findTaskByUsername(validTasksToLookUp, lookupData.name);
        result.push({
          task,
          result: await this.uuidProcessor.process(lookupData.id)
        });
      }
    } catch (err) {
      for (const erroredTask of validTasksToLookUp) {
        result.push({ task: erroredTask, result: err as Error });
      }
    }

    return result;
  }

  private isValidUsername(username: string): boolean {
    return /^[a-z0-9-_]{1,16}$/i.test(username);
  }

  private findTaskByUsername(tasks: PrismaClient.ImportTask[], username: string): PrismaClient.ImportTask {
    username = username.toLowerCase();
    const result = tasks.find(task => task.payload.toString().toLowerCase() === username);
    if (result == null) {
      throw new Error(`No task found for username '${username}'`);
    }
    return result;
  }
}
