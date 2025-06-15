import * as PrismaClient from '@prisma/client';
import { singleton } from 'tsyringe';
import DatabaseClient from '../../../database/DatabaseClient.js';
import ImageManipulator from '../../image/ImageManipulator.js';
import MinecraftProfileTextures from '../../value-objects/MinecraftProfileTextures.js';

@singleton()
export default class CapePersister {
  constructor(
    private readonly databaseClient: DatabaseClient,
  ) {
  }

  async persistMojangCape(textureValue: string, capeImage: Buffer): Promise<bigint> {
    const parsedTextures = MinecraftProfileTextures.fromPropertyValue(textureValue);

    const capeUrl = parsedTextures.getSecureCapeUrl();
    if (capeUrl == null) {
      throw new Error('Cannot persist cape for texture value without cape URL');
    }
    if (!MinecraftProfileTextures.isOfficialTextureUrl(capeUrl)) {
      throw new Error('Expecting an official cape URL in profile textures');
    }

    //noinspection ES6RedundantAwait
    return await this.databaseClient.$transaction(async (transaction): Promise<bigint> => {
      const existingCapeByUrl = await transaction.capeUrl.findUnique({
        where: { url: capeUrl },
        select: { capeId: true },
      });
      if (existingCapeByUrl != null) {
        return existingCapeByUrl.capeId;
      }

      const capePixelDataHash = await this.computePixelDataHash(capeImage);

      const existingCape = await transaction.cape.findUnique({
        select: { id: true },
        where: { type_pixelDataHash: { type: 'MOJANG', pixelDataHash: capePixelDataHash } },
      });
      if (existingCape != null) {
        await transaction.capeUrl.create({
          data: {
            url: capeUrl,
            capeId: existingCape.id,
          },
          select: { capeId: true },
        });
        return existingCape.id;
      }

      const persistedCape = await transaction.cape.create({
        data: {
          type: 'MOJANG',
          pixelDataHash: capePixelDataHash,
          imageBytes: capeImage,
          mimeType: 'image/png',

          capeUrls: { create: { url: capeUrl } },
        },
        select: { id: true },
      });
      return persistedCape.id;
    });
  }

  async persistGenericCape(
    type: PrismaClient.CapeType,
    capeImage: Buffer,
    mimeType: string,
  ): Promise<bigint> {
    if (type === 'MOJANG') {
      throw new Error('persisting MOJANG capes has to be done with #persistMojangCape');
    }

    //noinspection ES6RedundantAwait
    return await this.databaseClient.$transaction(async (transaction): Promise<bigint> => {
      const capePixelDataHash = await this.computePixelDataHash(capeImage);

      const existingCape = await transaction.cape.findUnique({
        select: { id: true },
        where: { type_pixelDataHash: { type, pixelDataHash: capePixelDataHash } },
      });
      if (existingCape != null) {
        return existingCape.id;
      }

      const persistedCape = await transaction.cape.create({
        data: {
          type,
          pixelDataHash: capePixelDataHash,
          imageBytes: capeImage,
          mimeType,
        },
        select: { id: true },
      });
      return persistedCape.id;
    });
  }

  private async computePixelDataHash(buffer: Buffer): Promise<Buffer> {
    return (await ImageManipulator.createByImage(buffer)).calculatePixelDataHashXXH128();
  }
}
