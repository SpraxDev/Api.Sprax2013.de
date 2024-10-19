import * as PrismaClient from '@prisma/client';
import UUID from '../../../util/UUID.js';
import BulkImporter from './BulkImporter.js';

export default class UuidBulkImporter implements BulkImporter {
  isValidPayload(payload: string): true | string {
    if (UUID.looksLikeUuid(payload)) {
      return true;
    }
    return `Invalid UUID: ${JSON.stringify(payload)}`;
  }

  createTasks(payload: string, importGroupId: bigint): PrismaClient.Prisma.ImportTaskCreateManyInput[] {
    return [{
      payload: Buffer.from(UUID.normalize(payload)),
      payloadType: 'UUID',
      importGroupId
    }];
  }
}
