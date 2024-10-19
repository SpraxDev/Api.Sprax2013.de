import * as  PrismaClient from '@prisma/client';
import Fs from 'node:fs';
import { singleton } from 'tsyringe';
import DatabaseClient from '../../database/DatabaseClient.js';
import UUID from '../../util/UUID.js';

export type BulkQueueImportResult = {
  importGroupId: bigint,
  queued: number,
  error: number,
  duplicate: number,
  lastError: string | null
}

@singleton()
export default class BulkQueueImporter {
  constructor(
    private readonly databaseClient: DatabaseClient
  ) {
  }

  async importEachLine(filePath: string, type: 'uuid', ownerTmp: string): Promise<BulkQueueImportResult> {
    const fileHandle = await Fs.promises.open(filePath, 'r');
    const totalFileBytes = (await fileHandle.stat()).size;

    if (type !== 'uuid') {
      throw new Error(`Unsupported bulk queue import type: ${type}`);
    }

    try {
      let result: BulkQueueImportResult;

      await this.databaseClient.$transaction(async (transaction) => {
        let totalPayloadsProcessed = 0;

        let lastProgressReportTotalPayloads = 0;
        let lastReportedProgress = Date.now();

        const importGroup = await transaction.importGroup.create({
          data: { ownerTmp },
          select: { id: true }
        });
        result = {
          importGroupId: importGroup.id,
          queued: 0,
          error: 0,
          duplicate: 0,
          lastError: null
        };

        const insertBatch: PrismaClient.Prisma.ImportTaskCreateManyInput[] = [];
        for await (const line of fileHandle.readLines({ encoding: 'utf-8' })) {
          const payload = line.trim();
          if (payload === '') {
            continue;
          }
          ++totalPayloadsProcessed;

          if (totalPayloadsProcessed % 20_000 === 0) {
            this.reportProgress(lastReportedProgress, lastProgressReportTotalPayloads, totalFileBytes, Buffer.from(payload).length, totalPayloadsProcessed);
            lastReportedProgress = Date.now();
            lastProgressReportTotalPayloads = totalPayloadsProcessed;
          }

          if (!UUID.looksLikeUuid(payload)) {
            ++result.error;
            result.lastError = `Invalid UUID: ${JSON.stringify(payload)}`;
            if (result.error >= 5) {
              result.lastError = `Aborting import due to too many errors (previous error: ${result.lastError})`;
              break;
            }

            continue;
          }

          insertBatch.push({
            payload: Buffer.from(UUID.normalize(payload)),
            payloadType: 'UUID',
            importGroupId: importGroup.id
          });
          if (insertBatch.length >= 250) {
            const newlyQueued = await this.writeBatch(transaction, insertBatch);
            result.queued += newlyQueued;
            result.duplicate += insertBatch.length - newlyQueued;
            insertBatch.length = 0;
          }
        }

        if (insertBatch.length > 0) {
          const newlyQueued = await this.writeBatch(transaction, insertBatch);
          result.queued += newlyQueued;
          result.duplicate += insertBatch.length - newlyQueued;
          insertBatch.length = 0;
        }

        console.log(`Processed ${totalPayloadsProcessed} lines [100%]`);

        await transaction.importGroup.update({
          where: { id: result.importGroupId },
          data: {
            done: result.error >= 5 || result.queued === 0,
            lastErrorMessage: result.lastError,

            totalParsedPayloads: totalPayloadsProcessed,
            erroredImports: { increment: result.error },
            duplicateImports: { increment: result.duplicate }
          }
        });
      }, { timeout: 60 * 60 * 1000 /* 1h */ });

      return result!;
    } finally {
      await fileHandle.close();
    }
  }

  private async writeBatch(transaction: PrismaClient.Prisma.TransactionClient, data: PrismaClient.Prisma.ImportTaskCreateManyInput[]): Promise<number> {
    const batch = await transaction.importTask.createMany({
      data,
      skipDuplicates: true
    });
    return batch.count;
  }

  private reportProgress(
    lastReportedProgress: number,
    lastProgressReportTotalPayloads: number,
    totalFileBytes: number,
    lineBytes: number,
    totalPayloadsProcessed: number
  ): void {
    const secondsSinceLastReport = (Date.now() - lastReportedProgress) / 1000;
    const estimatedTotalLines = Math.round(totalFileBytes / (lineBytes + '\n'.length));

    const completionPercentage = totalPayloadsProcessed / estimatedTotalLines * 100;
    const linesPerSecond = Math.round((totalPayloadsProcessed - lastProgressReportTotalPayloads) / secondsSinceLastReport);
    const estimatedTimeLeft = Math.max(Math.round((estimatedTotalLines - totalPayloadsProcessed) / linesPerSecond), 0);

    console.log(`Processed ${totalPayloadsProcessed} / ~${estimatedTotalLines} lines [~${completionPercentage.toFixed(2)}%] (${linesPerSecond} lines/s) (~${estimatedTimeLeft}s remaining)`);
  }
}
