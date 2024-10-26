import { singleton } from 'tsyringe';
import DatabaseClient from '../../database/DatabaseClient.js';
import ImageManipulator from '../image/ImageManipulator.js';
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
      select: { skinId: true }
    });
    return skinInDatabase?.skinId ?? null;
  }

  async findByUrl(skinUrl: string): Promise<CachedSkin | null> {
    const skinInDatabase = await this.databaseClient.skinUrl.findUnique({
      where: { url: skinUrl },
      select: {
        skin: {
          select: {
            id: true,
            imageBytes: true,
            normalizedSkin: true
          }
        }
      }
    });

    if (skinInDatabase == null) {
      return null;
    }

    const skinImage = await SkinImageManipulator.createByImage(skinInDatabase.skin.imageBytes);
    let normalizedSkin = skinImage;
    if (skinInDatabase.skin.normalizedSkin != null) {
      normalizedSkin = await SkinImageManipulator.createByImage(skinInDatabase.skin.normalizedSkin.imageBytes);
    }

    return {
      imageId: skinInDatabase.skin.id,
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
    const skinPixelDataHash = await this.computePixelDataHash(skin);
    const existingSkinImage = await this.databaseClient.skin.findUnique({
      where: { pixelDataHash: skinPixelDataHash },
      select: { id: true }
    });
    return existingSkinImage != null;
  }

  private async computePixelDataHash(buffer: Buffer): Promise<Buffer> {
    return (await ImageManipulator.createByImage(buffer)).calculatePixelDataHashXXH128();
  }
}
