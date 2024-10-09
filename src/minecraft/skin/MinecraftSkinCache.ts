import Crypto from 'node:crypto';
import { singleton } from 'tsyringe';
import DatabaseClient from '../../database/DatabaseClient.js';
import { UuidToProfileResponse } from '../MinecraftApiClient.js';
import SkinImageManipulator from './manipulator/SkinImageManipulator.js';

export type CachedSkin = {
  original: SkinImageManipulator,
  normalized: SkinImageManipulator
}

@singleton()
export default class MinecraftSkinCache {
  constructor(
    private readonly databaseClient: DatabaseClient
  ) {
  }

  async findByUrl(skinUrl: string): Promise<CachedSkin | null> {
    const skinInDatabase = await this.databaseClient.skinUrl.findUnique({
      where: { url: skinUrl },
      select: {
        image: {
          select: {
            imageBytes: true,
            normalizedImage: true
          }
        }
      }
    });

    if (skinInDatabase == null) {
      return null;
    }

    const skinImage = await SkinImageManipulator.createByImage(skinInDatabase.image.imageBytes);
    let normalizedSkin = skinImage;
    if (skinInDatabase.image.normalizedImage != null) {
      normalizedSkin = await SkinImageManipulator.createByImage(skinInDatabase.image.normalizedImage.imageBytes);
    }

    return {
      original: skinImage,
      normalized: normalizedSkin
    };
  }

  async existsSkinUrlWithNonNullTextureValue(skinUrl: string): Promise<boolean> {
    const existingSkinUrl = await this.databaseClient.skinUrl.findUnique({
      where: { url: skinUrl, textureValue: { not: null }, textureSignature: { not: null } },
      select: { url: true }
    });
    return existingSkinUrl != null;
  }

  async persist(
    skin: Buffer,
    normalizedSkin: Buffer,
    skinUrl: string | null,
    textureProperty?: UuidToProfileResponse['properties'][0]
  ): Promise<void> {
    const originalImageSha256 = this.computeSha256(skin);
    const normalizedImageSha256 = this.computeSha256(normalizedSkin);

    await this.databaseClient.$transaction(async (transaction) => {
      let existingSkinImage = await transaction.skinImage.findUnique({
        select: { imageSha256: true },
        where: { imageSha256: originalImageSha256 }
      });

      if (existingSkinImage == null) {
        existingSkinImage = await transaction.skinImage.create({
          data: {
            imageSha256: originalImageSha256,
            imageBytes: skin,
            normalizedImage: {
              connectOrCreate: {
                where: { imageSha256: normalizedImageSha256 },
                create: {
                  imageSha256: normalizedImageSha256,
                  imageBytes: normalizedSkin
                }
              }
            },

            skinUrls: skinUrl != null ? {
              create: {
                url: skinUrl,
                textureValue: textureProperty?.value,
                textureSignature: textureProperty?.signature
              }
            } : undefined,
            skins: { create: {} }
          },
          select: { imageSha256: true }
        });
      }

      if (skinUrl != null) {
        const existingSkinUrl = await transaction.skinUrl.findUnique({
          where: { url: skinUrl }
        });
        if (existingSkinUrl == null) {
          await transaction.skinUrl.create({
            data: {
              url: skinUrl,
              textureValue: textureProperty?.value,
              textureSignature: textureProperty?.signature,
              imageSha256: existingSkinImage.imageSha256
            }
          });
        }
      }
    });
  }

  private computeSha256(buffer: Buffer): Buffer {
    return Crypto
      .createHash('sha256')
      .update(buffer)
      .digest();
  }
}
