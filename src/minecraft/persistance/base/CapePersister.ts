import * as PrismaClient from '@prisma/client';
import Crypto from 'node:crypto';
import { singleton } from 'tsyringe';
import DatabaseClient from '../../../database/DatabaseClient.js';
import MinecraftProfileTextures from '../../value-objects/MinecraftProfileTextures.js';

@singleton()
export default class CapePersister {
  constructor(
    private readonly databaseClient: DatabaseClient
  ) {
  }

  async persistMojangCape(textureValue: string, capeImage: Buffer): Promise<bigint> {
    const parsedTextures = MinecraftProfileTextures.fromPropertyValue(textureValue);

    const capeUrl = parsedTextures.getSecureCapeUrl();
    if (capeUrl == null) {
      throw new Error('Cannot persist cape for texture value without cape URL');
    }
    if (!MinecraftProfileTextures.isOfficialSkinUrl(capeUrl)) {
      throw new Error('Expecting an official cape URL in profile textures');
    }

    //noinspection ES6RedundantAwait
    return await this.databaseClient.$transaction(async (transaction): Promise<bigint> => {
      const existingCapeByUrl = await transaction.capeUrl.findUnique({
        where: { url: capeUrl },
        select: { capeId: true }
      });
      if (existingCapeByUrl != null) {
        return existingCapeByUrl.capeId;
      }

      const capeImageSha256 = this.computeSha256(capeImage);

      const existingCape = await transaction.cape.findUnique({
        select: { id: true },
        where: { type_imageSha256: { type: 'MOJANG', imageSha256: capeImageSha256 } }
      });
      if (existingCape != null) {
        await transaction.capeUrl.create({
          data: {
            url: capeUrl,
            capeId: existingCape.id
          }
        });
        return existingCape.id;
      }

      const persistedCape = await transaction.cape.create({
        data: {
          type: 'MOJANG',
          imageSha256: capeImageSha256,
          imageBytes: capeImage,
          mimeType: 'image/png',

          capeUrls: { create: { url: capeUrl } }
        },
        select: { id: true }
      });
      return persistedCape.id;
    });
  }

  async persistGenericCape(
    type: PrismaClient.CapeType,
    capeImage: Buffer,
    mimeType: string
  ): Promise<bigint> {
    //noinspection ES6RedundantAwait
    return await this.databaseClient.$transaction(async (transaction): Promise<bigint> => {
      const capeImageSha256 = this.computeSha256(capeImage);

      const existingCape = await transaction.cape.findUnique({
        select: { id: true },
        where: { type_imageSha256: { type, imageSha256: capeImageSha256 } }
      });
      if (existingCape != null) {
        return existingCape.id;
      }

      const persistedCape = await transaction.cape.create({
        data: {
          type,
          imageSha256: capeImageSha256,
          imageBytes: capeImage,
          mimeType
        },
        select: { id: true }
      });
      return persistedCape.id;
    });
  }

  private computeSha256(buffer: Buffer): Buffer {
    return Crypto
      .createHash('sha256')
      .update(buffer)
      .digest();
  }
}
