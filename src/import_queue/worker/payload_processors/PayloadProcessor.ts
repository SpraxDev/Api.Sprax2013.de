import * as PrismaClient from '@prisma/client';

export default interface PayloadProcessor {
  /**
   * @returns false, if not changes have been made/written
   */
  process(task: PrismaClient.ImportTask): Promise<boolean>;
}
