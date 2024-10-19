import * as PrismaClient from '@prisma/client';
import BulkImporter from './BulkImporter.js';

export default class UsernameBulkImporter implements BulkImporter {
  isValidPayload(payload: string): true | string {
    if (/^[a-z0-9_-]{3,16}$/i.test(payload)) {
      return true;
    }
    return `Invalid Username: ${JSON.stringify(payload)}`;
  }

  createTasks(payload: string, importGroupId: bigint): PrismaClient.Prisma.ImportTaskCreateManyInput[] {
    return [{
      payload: Buffer.from(payload.toLowerCase()),
      payloadType: 'USERNAME',
      importGroupId
    }];
  }
}
