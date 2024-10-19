import * as PrismaClient from '@prisma/client';
import MinecraftProfileTextures from '../../../minecraft/value-objects/MinecraftProfileTextures.js';
import BulkImporter from './BulkImporter.js';
import UuidBulkImporter from './UuidBulkImporter.js';

export default class ProfileTextureValueBulkImporter implements BulkImporter {
  constructor(
    private readonly uuidBulkImporter: UuidBulkImporter
  ) {
  }

  isValidPayload(payload: string): true | string {
    const payloadArgs = payload.split(',');
    if (payloadArgs.length > 2) {
      return `Invalid number of arguments (expected 1 or 2, got ${payloadArgs.length})`;
    }

    if (payloadArgs[0].length === 0) {
      return `Invalid value (expected non-empty texture value)`;
    }

    try {
      MinecraftProfileTextures.fromPropertyValue(payloadArgs[0]);
    } catch (err: any) {
      return `Invalid value (unable to parse texture value)`;
    }

    return true;
  }

  createTasks(payload: string, importGroupId: bigint): PrismaClient.Prisma.ImportTaskCreateManyInput[] {
    const [textureValue, textureSignature] = payload.split(',');
    const parsedTextures = MinecraftProfileTextures.fromPropertyValue(textureValue);

    const tasks: PrismaClient.Prisma.ImportTaskCreateManyInput[] = [];

    if (parsedTextures.getSecureSkinUrl() != null || parsedTextures.getSecureCapeUrl() != null) {
      tasks.push({
        payload: Buffer.from(JSON.stringify({
          value: textureValue,
          signature: textureSignature.length !== 0 ? textureSignature : undefined
        })),
        payloadType: 'PROFILE_TEXTURE_VALUE',
        importGroupId
      });
    }

    const uuidTask = this.uuidBulkImporter.isValidPayload(parsedTextures.profileId);
    if (uuidTask === true) {
      tasks.push(...this.uuidBulkImporter.createTasks(parsedTextures.profileId, importGroupId));
    }

    return tasks;
  }
}
