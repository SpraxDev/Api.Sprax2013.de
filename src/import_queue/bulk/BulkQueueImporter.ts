import * as PrismaClient from '@prisma/client';
import Fs from 'node:fs';
import Path from 'node:path';
import { singleton } from 'tsyringe';
import DatabaseClient from '../../database/DatabaseClient.js';
import BulkImporter from './importer/BulkImporter.js';
import ProfileTextureValueBulkImporter from './importer/ProfileTextureValueBulkImporter.js';
import SkinFileBulkImporter from './importer/SkinFileBulkImporter.js';
import UsernameBulkImporter from './importer/UsernameBulkImporter.js';
import UuidBulkImporter from './importer/UuidBulkImporter.js';

export type BulkQueueImportResult = {
  importGroupId: bigint,
  queued: number,
  error: number,
  duplicate: number,
  lastError: string | null,
  aborted: boolean
}

@singleton()
export default class BulkQueueImporter {
  constructor(
    private readonly databaseClient: DatabaseClient,
  ) {
  }

  async importEachLine(filePath: string, type: 'uuid' | 'username' | 'profile-texture-value', importingApiKeyId: bigint): Promise<BulkQueueImportResult> {
    const fileHandle = await Fs.promises.open(filePath, 'r');
    const totalFileBytes = (await fileHandle.stat()).size;

    let payloadImporter: BulkImporter;
    switch (type) {
      case 'uuid':
        payloadImporter = new UuidBulkImporter();
        break;
      case 'username':
        payloadImporter = new UsernameBulkImporter();
        break;
      case 'profile-texture-value':
        payloadImporter = new ProfileTextureValueBulkImporter(new UuidBulkImporter());
        break;

      default:
        throw new Error(`Unsupported bulk queue import type: ${type}`);
    }

    try {
      let result: BulkQueueImportResult;

      await this.databaseClient.$transaction(async (transaction) => {
        let totalPayloadsProcessed = 0;

        let lastProgressReportTotalPayloads = 0;
        let lastReportedProgress = Date.now();

        const importGroup = await transaction.importGroup.create({
          data: { importingApiKeyId },
          select: { id: true },
        });
        result = {
          importGroupId: importGroup.id,
          queued: 0,
          error: 0,
          duplicate: 0,
          lastError: null,
          aborted: false,
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

          const validationResult = await payloadImporter.isValidPayload(payload);
          if (validationResult !== true) {
            ++result.error;
            result.lastError = validationResult;
            //            if (result.error >= 5) {
            //              result.aborted = true;
            //              result.lastError = `Aborting import due to too many errors (previous error: ${result.lastError})`;
            //              break;
            //            }

            continue;
          }

          insertBatch.push(...payloadImporter.createTasks(payload, importGroup.id));
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
            duplicateImports: { increment: result.duplicate },
          },
          select: { id: true },
        });
      }, { timeout: 60 * 60 * 1000 /* 1h */ });

      return result!;
    } finally {
      await fileHandle.close();
    }
  }

  // FIXME: refactor both import methods into one single method that uses another method for the payload "reading"
  async importEachSkinFile(directoryPath: string, importingApiKeyId: bigint): Promise<BulkQueueImportResult> {
    const dirHandle = await Fs.promises.opendir(directoryPath, { recursive: true });

    const payloadImporter = new SkinFileBulkImporter();

    try {
      let result: BulkQueueImportResult;

      await this.databaseClient.$transaction(async (transaction) => {
        let totalPayloadsProcessed = 0;

        let lastProgressReportTotalPayloads = 0;
        let lastReportedProgress = Date.now();

        const importGroup = await transaction.importGroup.create({
          data: { importingApiKeyId },
          select: { id: true },
        });
        result = {
          importGroupId: importGroup.id,
          queued: 0,
          error: 0,
          duplicate: 0,
          lastError: null,
          aborted: false,
        };

        const insertBatch: PrismaClient.Prisma.ImportTaskCreateManyInput[] = [];
        for await (const dirent of dirHandle) {
          if (dirent.isDirectory()) {
            continue;
          }

          ++totalPayloadsProcessed;
          const direntPath = Path.join(dirent.parentPath, dirent.name);

          if (totalPayloadsProcessed % 20_000 === 0) {
            this.reportProgressWithoutTotalProgress(lastReportedProgress, lastProgressReportTotalPayloads, totalPayloadsProcessed);
            lastReportedProgress = Date.now();
            lastProgressReportTotalPayloads = totalPayloadsProcessed;
          }

          const validationResult = await payloadImporter.isValidPayload(direntPath);
          if (validationResult !== true) {
            ++result.error;
            result.lastError = validationResult;
            continue;
          }

          insertBatch.push(...payloadImporter.createTasks(direntPath, importGroup.id));
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

        console.log(`Processed ${totalPayloadsProcessed} payloads [100%]`);

        await transaction.importGroup.update({
          where: { id: result.importGroupId },
          data: {
            done: result.error >= 5 || result.queued === 0,
            lastErrorMessage: result.lastError,

            totalParsedPayloads: totalPayloadsProcessed,
            erroredImports: { increment: result.error },
            duplicateImports: { increment: result.duplicate },
          },
          select: { id: true },
        });
      }, { timeout: 60 * 60 * 1000 /* 1h */ });

      return result!;
    } finally {
      try {
        await dirHandle.close();
      } catch (err: any) {
        if (err.code !== 'ERR_DIR_CLOSED') {
          console.error(err);
        }
      }
    }
  }

  private async writeBatch(transaction: PrismaClient.Prisma.TransactionClient, data: PrismaClient.Prisma.ImportTaskCreateManyInput[]): Promise<number> {
    const batch = await transaction.importTask.createMany({
      data,
      skipDuplicates: true,
    });
    return batch.count;
  }

  private reportProgress(
    lastReportedProgress: number,
    lastProgressReportTotalPayloads: number,
    totalFileBytes: number,
    lineBytes: number,
    totalPayloadsProcessed: number,
  ): void {
    const secondsSinceLastReport = (Date.now() - lastReportedProgress) / 1000;
    const estimatedTotalLines = Math.round(totalFileBytes / (lineBytes + '\n'.length));

    const completionPercentage = totalPayloadsProcessed / estimatedTotalLines * 100;
    const linesPerSecond = Math.round((totalPayloadsProcessed - lastProgressReportTotalPayloads) / secondsSinceLastReport);
    const estimatedTimeLeft = Math.max(Math.round((estimatedTotalLines - totalPayloadsProcessed) / linesPerSecond), 0);

    console.log(`Processed ${totalPayloadsProcessed} / ~${estimatedTotalLines} payloads [~${completionPercentage.toFixed(2)}%] (${linesPerSecond} payloads/s) (~${estimatedTimeLeft}s remaining)`);
  }

  private reportProgressWithoutTotalProgress(
    lastReportedProgress: number,
    lastProgressReportTotalPayloads: number,
    totalPayloadsProcessed: number,
  ): void {
    const secondsSinceLastReport = (Date.now() - lastReportedProgress) / 1000;

    const linesPerSecond = Math.round((totalPayloadsProcessed - lastProgressReportTotalPayloads) / secondsSinceLastReport);

    console.log(`Processed ${totalPayloadsProcessed} payloads (${linesPerSecond} payloads/s)`);
  }
}
