import type * as PrismaClient from '@prisma/client';
import Fs from 'node:fs';
import Path from 'node:path';
import Sharp from 'sharp';
import BulkImporter from './BulkImporter.js';

export default class SkinFileBulkImporter implements BulkImporter {
  async isValidPayload(payload: string): Promise<true | string> {
    try {
      const fileMetadata = await Sharp(payload).metadata();
      if (fileMetadata.format !== 'png') {
        return 'Invalid skin file format: Expected PNG, got ' + fileMetadata.format;
      }
      if (fileMetadata.width === 64 && (fileMetadata.height === 64 || fileMetadata.height === 32)) {
        return true;
      }

      return `Invalid skin file dimensions: Expected 64x64 or 64x32, got ${fileMetadata.width}x${fileMetadata.height} for file ${Path.basename(payload)}`;
    } catch (err) {
      return `Invalid skin file: ${Path.basename(payload)} - ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  createTasks(payload: string, importGroupId: bigint): PrismaClient.Prisma.ImportTaskCreateManyInput[] {
    return [{
      payload: Fs.readFileSync(payload),
      payloadType: 'SKIN_IMAGE',
      importGroupId,
    }];
  }
}
