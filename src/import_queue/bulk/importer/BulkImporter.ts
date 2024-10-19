import type * as PrismaClient from '@prisma/client';

export default interface BulkImporter {
  isValidPayload(payload: string): true | string;

  createTasks(payload: string, importGroupId: bigint): PrismaClient.Prisma.ImportTaskCreateManyInput[];
}
