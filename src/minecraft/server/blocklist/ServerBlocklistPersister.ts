import { Prisma } from '@prisma/client';
import { singleton } from 'tsyringe';
import DatabaseClient from '../../../database/DatabaseClient.js';

@singleton()
export default class ServerBlocklistPersister {
  constructor(
    private readonly databaseClient: DatabaseClient
  ) {
  }

  async updateBlocklistInDatabase(blocklist: string[]): Promise<void> {
    const blockListHashes = blocklist.map(v => Buffer.from(v, 'hex'));

    await this.databaseClient.$transaction(async (transaction) => {
      await transaction.$executeRaw`LOCK TABLE server_blocklist_changes IN EXCLUSIVE MODE NOWAIT;`;
      await this.updateMaterializedView(transaction);

      const wroteAnyChanges1 = await this.updateHashesThatAreNoLongerBlocked(transaction, blockListHashes);
      const wroteAnyChanges2 = await this.updateHashesThatAreNowBlocked(transaction, blockListHashes);
      if (wroteAnyChanges1 || wroteAnyChanges2) {
        await this.updateMaterializedView(transaction);
      }
    });
  }

  async updateMaterializedView(transaction?: Prisma.TransactionClient): Promise<void> {
    await (transaction ?? this.databaseClient).$executeRaw`REFRESH MATERIALIZED VIEW server_blocklist;`;
  }

  private async updateHashesThatAreNoLongerBlocked(transaction: Prisma.TransactionClient, blocklist: Buffer[]): Promise<boolean> {
    const hashesNoLongerBlocked = await transaction.serverBlocklist.findMany({
      where: {
        sha1: {
          notIn: blocklist
        }
      },
      select: { sha1: true }
    });
    if (hashesNoLongerBlocked.length <= 0) {
      return false;
    }

    await transaction.serverBlocklistChanges.createMany({
      data: hashesNoLongerBlocked.map(hash => ({
        sha1: hash.sha1,
        changeIsAdd: false
      }))
    });
    return true;
  }

  private async updateHashesThatAreNowBlocked(transaction: Prisma.TransactionClient, blocklist: Buffer[]): Promise<boolean> {
    const knownBlockedHashesResult = await transaction.serverBlocklist.findMany({
      where: {
        sha1: { in: blocklist }
      },
      select: { sha1: true }
    });
    const knownBlockedHashes = new Set(knownBlockedHashesResult.map(hash => hash.sha1.toString('hex')));

    let wroteAnyChanges = false;
    for (const hashToBlock of blocklist) {
      const hashAlreadyBlocked = knownBlockedHashes.has(hashToBlock.toString('hex'));
      if (!hashAlreadyBlocked) {
        await transaction.serverBlocklistChanges.create({
          data: {
            sha1: hashToBlock,
            changeIsAdd: true
          }
        });
        wroteAnyChanges = true;
      }
    }
    return wroteAnyChanges;
  }
}
