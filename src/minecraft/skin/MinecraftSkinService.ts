import Crypto from 'node:crypto';
import Fs from 'node:fs';
import Path from 'node:path';
import { singleton } from 'tsyringe';
import { APP_RESOURCES_DIR } from '../../constants.js';
import DatabaseClient from '../../database/DatabaseClient.js';
import TrustedProxiedHttpClient from '../../http/clients/TrustedProxiedHttpClient.js';
import { UuidToProfileResponse } from '../MinecraftApiClient.js';
import MinecraftProfile, { DefaultSkin } from '../value-objects/MinecraftProfile.js';
import MinecraftSkinNormalizer from './manipulator/MinecraftSkinNormalizer.js';
import SkinImageManipulator from './manipulator/SkinImageManipulator.js';

@singleton()
export default class MinecraftSkinService {
  private static readonly steve = Fs.promises.readFile(Path.join(APP_RESOURCES_DIR, 'steve.png'));
  private static readonly alex = Fs.promises.readFile(Path.join(APP_RESOURCES_DIR, 'alex.png'));

  constructor(
    private readonly httpClient: TrustedProxiedHttpClient,
    private readonly databaseClient: DatabaseClient,
    private readonly minecraftSkinNormalizer: MinecraftSkinNormalizer
  ) {
  }

  async fetchEffectiveSkin(profile: MinecraftProfile): Promise<SkinImageManipulator> {
    const skinUrl = profile.parseTextures()?.getSecureSkinUrl();
    if (skinUrl == null) {
      return this.getDefaultSkin(profile.determineDefaultSkin());
    }

    return this.fetchSkin(skinUrl, profile.getTexturesProperty() ?? undefined);
  }

  private async fetchSkin(skinUrl: string, textureProperty?: UuidToProfileResponse['properties'][0]): Promise<SkinImageManipulator> {
    let skin = await this.findSkinByUrl(skinUrl);
    if (skin != null) {
      return skin;
    }

    const skinImage = await this.httpClient.get(skinUrl);
    if (!skinImage.ok) {
      throw new Error(`Failed to fetch skin from URL: ${skinUrl}`);
    }

    skin = await SkinImageManipulator.createByImage(skinImage.body);

    // TODO: Maybe we can optimize this whole method by knowing whether to fetch the original image or the normalized one
    const normalizedSkin = await this.minecraftSkinNormalizer.normalizeSkin(skin);
    await this.persistSkin(skinUrl, skinImage.body, await normalizedSkin.toPngBuffer(), textureProperty);

    return skin;
  }

  private async getDefaultSkin(skin: DefaultSkin): Promise<SkinImageManipulator> {
    if (skin === 'alex') {
      return SkinImageManipulator.createByImage(await MinecraftSkinService.alex);
    }
    return SkinImageManipulator.createByImage(await MinecraftSkinService.steve);
  }

  private async persistSkin(
    skinUrl: string,
    skin: Buffer,
    normalizedSkin: Buffer,
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

            skinUrls: {
              create: {
                url: skinUrl,
                textureValue: textureProperty?.value,
                textureSignature: textureProperty?.signature
              }
            },
            skins: { create: {} }
          },
          select: { imageSha256: true }
        });
      }

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
    });
  }

  private async findSkinByUrl(skinUrl: string): Promise<SkinImageManipulator | null> {
    const skinInDatabase = await this.databaseClient.skinUrl.findUnique({
      where: { url: skinUrl },
      select: { image: { select: { imageBytes: true } } }
    });
    if (skinInDatabase?.image.imageBytes != null) {
      return SkinImageManipulator.createByImage(skinInDatabase.image.imageBytes);
    }
    return null;
  }

  private computeSha256(buffer: Buffer): Buffer {
    const hash = Crypto.createHash('sha256');
    hash.update(buffer);
    return hash.digest();
  }
}
