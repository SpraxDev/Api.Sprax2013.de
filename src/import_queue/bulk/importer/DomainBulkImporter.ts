import * as PrismaClient from '@prisma/client';
import type ServerBlocklistService from '../../../minecraft/server/blocklist/ServerBlocklistService.js';
import type BulkImporter from './BulkImporter.js';

export default class DomainBulkImporter implements BulkImporter {
  constructor(
    private readonly serverBlocklistService: ServerBlocklistService,
  ) {
  }

  isValidPayload(payload: string): true | string {
    return true;
  }

  async createTasks(payload: string, importGroupId: bigint): Promise<PrismaClient.Prisma.ImportTaskCreateManyInput[]> {
    try {
      await this.serverBlocklistService.checkBlocklist(payload);
    } catch (err) {
      console.error(`Error checking blocklist for Hostname ${payload}: ` + (err as Error).message);
    }

    return [];
  }
}
