import Crypto from 'node:crypto';
import { singleton } from 'tsyringe';
import DatabaseClient from '../../../database/DatabaseClient.js';
import MinecraftProfileTextures from '../../value-objects/MinecraftProfileTextures.js';

@singleton()
export default class SkinPersister {
  constructor(
    private readonly databaseClient: DatabaseClient
  ) {
  }

  // TODO: refactor
  async persist(
    originalSkinPng: Buffer,
    normalizedSkinPng: Buffer,
    skinUrlOrTextureProperty: string | { value: string, signature: string } | null
  ): Promise<bigint> {
    let skinUrl = typeof skinUrlOrTextureProperty === 'string' ? skinUrlOrTextureProperty : null;
    let textureValue: string | undefined = undefined;
    let textureSignature: string | undefined = undefined;
    let createdAt: Date | undefined = undefined;

    if (skinUrlOrTextureProperty != null && typeof skinUrlOrTextureProperty !== 'string') {
      const parsedTextures = MinecraftProfileTextures.fromPropertyValue(skinUrlOrTextureProperty.value);
      skinUrl = parsedTextures.getSecureSkinUrl();
      textureValue = skinUrlOrTextureProperty.value;
      textureSignature = skinUrlOrTextureProperty.signature;
      createdAt = parsedTextures.timestamp;
    }

    if (skinUrl != null && !MinecraftProfileTextures.isOfficialSkinUrl(skinUrl)) {
      throw new Error('Expecting an official skin URL');
    }

    //noinspection ES6RedundantAwait
    return await this.databaseClient.$transaction(async (transaction): Promise<bigint> => {
      if (skinUrl != null) {
        const existingSkinByUrl = await transaction.skinUrl.findUnique({
          where: { url: skinUrl },
          select: { imageId: true }
        });
        if (existingSkinByUrl != null) {
          return existingSkinByUrl.imageId;
        }
      }

      const originalImageSha256 = this.computeSha256(originalSkinPng);
      const normalizedImageSha256 = this.computeSha256(normalizedSkinPng);

      const existingSkin = await transaction.skin.findUnique({
        select: { id: true },
        where: { imageSha256: originalImageSha256 }
      });
      if (existingSkin != null) {
        if (skinUrl != null) {
          await transaction.skinUrl.create({
            data: {
              url: skinUrl,
              textureValue,
              textureSignature,
              imageId: existingSkin.id,
              createdAt
            }
          });
        }
        return existingSkin.id;
      }

      const persistedSkin = await transaction.skin.create({
        data: {
          imageSha256: originalImageSha256,
          imageBytes: originalSkinPng,
          normalizedImage: {
            connectOrCreate: {
              where: { imageSha256: normalizedImageSha256 },
              create: {
                imageSha256: normalizedImageSha256,
                imageBytes: normalizedSkinPng
              }
            }
          },

          skinUrls: skinUrl ? {
            create: {
              url: skinUrl,
              textureValue,
              textureSignature,
              createdAt
            }
          } : undefined
        },
        select: { id: true }
      });
      return persistedSkin.id;
    });
  }

  private computeSha256(buffer: Buffer): Buffer {
    return Crypto
      .createHash('sha256')
      .update(buffer)
      .digest();
  }
}
