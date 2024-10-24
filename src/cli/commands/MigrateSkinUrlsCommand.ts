import * as PrismaClient from '@prisma/client';
import Fs from 'node:fs';
import { singleton } from 'tsyringe';
import DatabaseClient from '../../database/DatabaseClient.js';
import AutoProxiedHttpClient from '../../http/clients/AutoProxiedHttpClient.js';
import ProfileTextureValueBulkImporter from '../../import_queue/bulk/importer/ProfileTextureValueBulkImporter.js';
import UuidBulkImporter from '../../import_queue/bulk/importer/UuidBulkImporter.js';
import SkinPersister from '../../minecraft/persistance/base/SkinPersister.js';
import MinecraftSkinNormalizer from '../../minecraft/skin/manipulator/MinecraftSkinNormalizer.js';
import SkinImageManipulator from '../../minecraft/skin/manipulator/SkinImageManipulator.js';
import MinecraftSkinCache from '../../minecraft/skin/MinecraftSkinCache.js';
import MinecraftProfileTextures from '../../minecraft/value-objects/MinecraftProfileTextures.js';
import CliCommand from './CliCommand.js';

type MigrateResult = {
  totalProcessedPayloads: number,
  errored: number,
  duplicateSkinUrls: number,
  duplicateTextureValuesAndUuids: number,
  importedFreshlyFetchedSkinUrls: number,
  importedFallbackSkinUrls: number,
  importedTextureValuesAndUuids: number,
  skinUrlsNotFound: number,
  textureValueNullResultingInNoSkinUrl: number
}

type MigrateSkinUrlsCliArgs = {
  filePath: string,
  importType: 'urls' | 'profile-texture-values'
}

@singleton()
export default class MigrateSkinUrlsCommand implements CliCommand {
  constructor(
    private readonly minecraftSkinCache: MinecraftSkinCache,
    private readonly httpClient: AutoProxiedHttpClient,
    private readonly databaseClient: DatabaseClient,
    private readonly minecraftSkinNormalizer: MinecraftSkinNormalizer,
    private readonly skinPersister: SkinPersister
  ) {
  }

  get commandName(): string {
    return 'migrate-skin-urls';
  }

  get commandUsage(): string {
    return 'migrate-skin-urls <file> <importType>\n' +
      '    <file>       is the path to the file to import\n' +
      '    <importType> is one of: urls, profile-texture-values\n' +
      '                 urls lines: skinUrl,apiKeyIdentifier,fallbackImage\n' +
      '                 profile-texture-values lines: textureValue,textureSignature,apiKeyIdentifier,fallbackImage';
  }

  async execute(args: string[]): Promise<boolean> {
    if (args.length !== 2) {
      console.error('Invalid number of arguments');
      console.error(`Usage: ${this.commandUsage}`);
      return false;
    }

    const parsedArgs = this.parseArgs(args);

    const result = await this.processFile(parsedArgs.filePath, parsedArgs.importType);
    console.log('\nFinished migrating everything:');
    console.log(result);
    return true;
  }

  private async processFile(filePath: string, importType: MigrateSkinUrlsCliArgs['importType']): Promise<MigrateResult> {
    const fileHandle = await Fs.promises.open(filePath, 'r');
    const totalFileBytes = (await fileHandle.stat()).size;

    try {
      const profileTextureValueBulkImporter = new ProfileTextureValueBulkImporter(new UuidBulkImporter());
      const migrateResult: MigrateResult = {
        totalProcessedPayloads: 0,
        errored: 0,
        duplicateSkinUrls: 0,
        duplicateTextureValuesAndUuids: 0,
        importedFreshlyFetchedSkinUrls: 0,
        importedFallbackSkinUrls: 0,
        importedTextureValuesAndUuids: 0,
        skinUrlsNotFound: 0,
        textureValueNullResultingInNoSkinUrl: 0
      };

      await this.databaseClient.$transaction(async (transaction) => {
        const apiKeyCache = new Map<string, bigint>();  // <apiKeyIdentifier, apiKeyId>
        const importGroupCache = new Map<bigint, bigint>(); // <apiKeyId, importGroupId>

        let lastProgressReportTotalPayloads = 0;
        let lastReportedProgress = Date.now();

        for await (const line of fileHandle.readLines({ encoding: 'utf-8' })) {
          const payload = line.trim();
          if (payload === '') {
            continue;
          }
          ++migrateResult.totalProcessedPayloads;

          if (migrateResult.totalProcessedPayloads % 1_000 === 0) {
            this.reportProgress(lastReportedProgress, lastProgressReportTotalPayloads, totalFileBytes, Buffer.from(payload).length, migrateResult.totalProcessedPayloads);
            lastReportedProgress = Date.now();
            lastProgressReportTotalPayloads = migrateResult.totalProcessedPayloads;
          }

          try {
            let skinUrl: string;
            let apiKeyIdentifier: string;
            let fallbackImageBytes: string;
            if (importType === 'urls') {
              [skinUrl, apiKeyIdentifier, fallbackImageBytes] = this.splitPayloadUrls(payload);
              if (skinUrl.startsWith('http://')) {
                skinUrl = 'https' + skinUrl.substring(4);
              }
            } else if (importType === 'profile-texture-values') {
              const [textureValue, _textureSignature, apiKeyIdentifierValue, fallbackImageBytesValue] = this.splitPayloadTextureValues(payload);
              if (textureValue == null) {
                ++migrateResult.textureValueNullResultingInNoSkinUrl;
                continue;
              }

              skinUrl = MinecraftProfileTextures.fromPropertyValue(textureValue).getSecureSkinUrl()!;
              apiKeyIdentifier = apiKeyIdentifierValue;
              fallbackImageBytes = fallbackImageBytesValue;
            } else {
              throw new Error(`Invalid import type ${JSON.stringify(importType)}`);
            }

            await this.processSkinUrl(skinUrl, fallbackImageBytes, migrateResult);

            const apiKeyId = apiKeyCache.get(apiKeyIdentifier) ?? await this.findApiKeyId(transaction, apiKeyIdentifier);
            const importGroupId = importGroupCache.get(apiKeyId) ?? (await transaction.importGroup.create({
              data: { importingApiKeyId: apiKeyId, totalParsedPayloads: -1 },
              select: { id: true }
            })).id;

            if (importType === 'profile-texture-values') {
              const [textureValue, textureSignature] = this.splitPayloadTextureValues(payload);

              const profileTextureValueBulkImportPayload = `${textureValue},${textureSignature}`;
              if (profileTextureValueBulkImporter.isValidPayload(profileTextureValueBulkImportPayload)) {
                const data = profileTextureValueBulkImporter.createTasks(`${textureValue},${textureSignature}`, importGroupId);
                const queued = await transaction.importTask.createMany({
                  data,
                  skipDuplicates: true
                });
                migrateResult.importedTextureValuesAndUuids += queued.count;
                migrateResult.duplicateTextureValuesAndUuids += data.length - queued.count;
              }
            }
          } catch (err: any) {
            if (err.clientVersion !== undefined) {  // Prisma error
              throw err;
            }
            ++migrateResult.errored;
            console.error(err);
          }
        }

        console.log(`Processed ${migrateResult.totalProcessedPayloads} lines [100%]`);
      }, { timeout: 12 * 60 * 60 * 1000 /* 12h */ });
      return migrateResult;
    } finally {
      await fileHandle.close();
    }
  }

  private splitPayloadUrls(payload: string): [string, string, string] {
    const indexOfFirstComma = payload.indexOf(',');
    const indexOfLastComma = payload.lastIndexOf(',');

    if (indexOfFirstComma === -1 || indexOfLastComma === -1 || indexOfLastComma === indexOfFirstComma) {
      throw new Error(`Invalid payload (expected 3 comma-separated values): ${payload}`);
    }

    return [
      payload.substring(0, indexOfFirstComma),
      payload.substring(indexOfFirstComma + 1, indexOfLastComma),
      payload.substring(indexOfLastComma + 1)
    ];
  }

  private splitPayloadTextureValues(payload: string): [string | null, string | null, string, string] {
    const indexOfFirstComma = payload.indexOf(',');
    const indexOfSecondComma = payload.indexOf(',', indexOfFirstComma + 1);
    const indexOfLastComma = payload.lastIndexOf(',');

    if (indexOfFirstComma === -1 || indexOfSecondComma === -1 || indexOfLastComma === -1 || indexOfLastComma === indexOfFirstComma || indexOfLastComma === indexOfSecondComma) {
      throw new Error(`Invalid payload (expected 4 comma-separated values): ${payload}`);
    }

    return [
      payload.substring(0, indexOfFirstComma) === '\\N' ? null : payload.substring(0, indexOfFirstComma),
      payload.substring(indexOfFirstComma + 1, indexOfSecondComma) === '\\N' ? null : payload.substring(indexOfFirstComma + 1, indexOfSecondComma),
      payload.substring(indexOfSecondComma + 1, indexOfLastComma),
      payload.substring(indexOfLastComma + 1)
    ];
  }

  private async processSkinUrl(skinUrl: string, fallbackImageBytes: string, migrateResult: MigrateResult): Promise<void> {
    const cachedSkinId = await this.minecraftSkinCache.findIdByUrl(skinUrl);
    if (cachedSkinId != null) {
      ++migrateResult.duplicateSkinUrls;
      return;
    }

    if (fallbackImageBytes !== '\\N' && !fallbackImageBytes.startsWith('\\\\x')) {
      throw new Error(`Invalid fallback image (expected \\\\x prefixed hex string or '\\N'): ${JSON.stringify(fallbackImageBytes)}`);
    }
    let skinImage: Buffer | null = null;
    let usedFallbackImage = false;
    const skinResponse = await this.httpClient.get(skinUrl);
    if (skinResponse.statusCode === 200) {
      skinImage = skinResponse.body;
    } else if (skinResponse.statusCode === 404) {
      if (fallbackImageBytes.startsWith('\\\\x')) {
        skinImage = Buffer.from(fallbackImageBytes.substring(3), 'hex');
        usedFallbackImage = true;
      }
    } else {
      throw new Error(`Failed to fetch skin from ${skinUrl} (status code ${skinResponse.statusCode})`);
    }
    if (skinImage != null) {
      await this.persistSkinInDatabase(skinUrl, skinImage);

      if (usedFallbackImage) {
        ++migrateResult.importedFallbackSkinUrls;
      } else {
        ++migrateResult.importedFreshlyFetchedSkinUrls;
      }
    } else {
      ++migrateResult.skinUrlsNotFound;
    }
  }

  private async persistSkinInDatabase(skinUrl: string, skinImage: Buffer): Promise<void> {
    const originalSkin = await SkinImageManipulator.createByImage(skinImage);
    const normalizedSkin = await this.minecraftSkinNormalizer.normalizeSkin(originalSkin);

    const isOfficialSkinUrl = MinecraftProfileTextures.isOfficialTextureUrl(skinUrl);
    await this.skinPersister.persist(
      skinImage,
      await normalizedSkin.toPngBuffer(),
      isOfficialSkinUrl ? skinUrl : null
    );
  }

  private async findApiKeyId(transaction: PrismaClient.Prisma.TransactionClient, apiKeyIdentifier: string): Promise<bigint> {
    const apiKeyName = `Migration: ${apiKeyIdentifier}`;

    const cachedApiKey = await transaction.apiKey.findFirst({
      where: { name: apiKeyName, internal: true },
      select: { id: true }
    });
    if (cachedApiKey != null) {
      return cachedApiKey.id;
    }

    const apiKey = await transaction.apiKey.create({
      data: { name: apiKeyName, internal: true, ownerId: '955e4cf6411c40d1a1765bc8e03a8a9a' },
      select: { id: true }
    });
    return apiKey.id;
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

  private parseArgs(args: string[]): MigrateSkinUrlsCliArgs {
    if (args[0].length === 0 || !Fs.existsSync(args[0])) {
      throw new Error(`File ${JSON.stringify(args[0])} does not exist`);
    }
    if (args[1].length === 0 || !['urls', 'profile-texture-values'].includes(args[1])) {
      throw new Error(`Invalid import type ${JSON.stringify(args[1])} – Expected one of [urls, profile-texture-values]`);
    }

    return {
      filePath: args[0],
      importType: args[1] as any
    };
  }
}
