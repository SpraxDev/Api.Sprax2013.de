import Crypto from 'node:crypto';
import { singleton } from 'tsyringe';
import DatabaseClient from '../../database/DatabaseClient.js';
import SkinImageManipulator from './manipulator/SkinImageManipulator.js';

export type CachedSkin = {
  imageId: bigint,
  original: SkinImageManipulator,
  normalized: SkinImageManipulator
}

@singleton()
export default class MinecraftSkinCache {
  constructor(
    private readonly databaseClient: DatabaseClient
  ) {
  }

  async findIdByUrl(skinUrl: string): Promise<bigint | null> {
    const skinInDatabase = await this.databaseClient.skinUrl.findUnique({
      where: { url: skinUrl },
      select: {
        imageId: true
      }
    });
    return skinInDatabase?.imageId ?? null;
  }

  async findByUrl(skinUrl: string): Promise<CachedSkin | null> {
    const skinInDatabase = await this.databaseClient.skinUrl.findUnique({
      where: { url: skinUrl },
      select: {
        image: {
          select: {
            id: true,
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
      imageId: skinInDatabase.image.id,
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

  async existsByImageBytes(skin: Buffer): Promise<boolean> {
    const skinImageSha256 = this.computeSha256(skin);
    const existingSkinImage = await this.databaseClient.skin.findUnique({
      where: { imageSha256: skinImageSha256 },
      select: { imageSha256: true }
    });
    return existingSkinImage != null;
  }

  private computeSha256(buffer: Buffer): Buffer {
    return Crypto
      .createHash('sha256')
      .update(buffer)
      .digest();
  }
}
