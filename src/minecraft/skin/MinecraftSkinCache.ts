import Crypto from 'node:crypto';
import { container, singleton } from 'tsyringe';
import DatabaseClient from '../../database/DatabaseClient.js';
import { UuidToProfileResponse } from '../MinecraftApiClient.js';
import MinecraftProfileService from '../profile/MinecraftProfileService.js';
import MinecraftProfile from '../value-objects/MinecraftProfile.js';
import MinecraftProfileTextures from '../value-objects/MinecraftProfileTextures.js';
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

  async persist(
    skin: Buffer,
    normalizedSkin: Buffer,
    skinUrl: string | null,
    textureProperty?: UuidToProfileResponse['properties'][0]
  ): Promise<void> {
    const originalImageSha256 = this.computeSha256(skin);
    const normalizedImageSha256 = this.computeSha256(normalizedSkin);

    await this.databaseClient.$transaction(async (transaction) => {
      let existingSkinImage = await transaction.skin.findUnique({
        select: { id: true },
        where: { imageSha256: originalImageSha256 }
      });

      if (existingSkinImage == null) {
        existingSkinImage = await transaction.skin.create({
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
            } : undefined
          },
          select: { id: true }
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
              imageId: existingSkinImage.id
            }
          });
        }
      }

      if (textureProperty?.value != null) {
        const parsedTextures = MinecraftProfileTextures.fromPropertyValue(textureProperty.value);
        const profileId = parsedTextures.profileId;

        const profile = await transaction.profile.findUnique({
          select: { id: true },
          where: { id: profileId }
        });
        if (profile == null) {
          await container.resolve(MinecraftProfileService).provideProfileByUuid(profileId);
        }

        const existingHistoryEntry = await transaction.profileRecentSkin.findUnique({
          where: {
            profileId_skinId: {
              profileId,
              skinId: existingSkinImage.id
            }
          },
          select: { firstSeenUsing: true, lastSeenUsing: true }
        });
        const updateHistoryEntry = existingHistoryEntry == null || existingHistoryEntry.lastSeenUsing < parsedTextures.timestamp;
        const overrideFirstSeenUsing = existingHistoryEntry != null && existingHistoryEntry.firstSeenUsing > parsedTextures.timestamp;

        if (updateHistoryEntry) {
          await transaction.profileRecentSkin.upsert({
            where: {
              profileId_skinId: {
                profileId,
                skinId: existingSkinImage.id
              }
            },
            create: {
              profileId,
              skinId: existingSkinImage.id,
              firstSeenUsing: parsedTextures.timestamp,
              lastSeenUsing: parsedTextures.timestamp
            },
            update: {
              firstSeenUsing: overrideFirstSeenUsing ? parsedTextures.timestamp : undefined,
              lastSeenUsing: parsedTextures.timestamp
            }
          });
        }
      }
    });
  }

  async persistSkinHistory(profile: MinecraftProfile): Promise<void> {
    const parsedTextures = profile.parseTextures();
    const skinUrl = parsedTextures?.getSecureSkinUrl();
    if (parsedTextures == null || skinUrl == null) {
      return;
    }

    const cachedSkin = await this.findByUrl(skinUrl);
    if (cachedSkin == null) {
      return;
    }

    await this.databaseClient.profileRecentSkin.upsert({
      where: {
        profileId_skinId: {
          profileId: profile.id,
          skinId: cachedSkin.imageId
        }
      },
      create: {
        profileId: profile.id,
        skinId: cachedSkin.imageId,
        firstSeenUsing: parsedTextures.timestamp,
        lastSeenUsing: parsedTextures.timestamp
      },
      update: {
        lastSeenUsing: parsedTextures.timestamp
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
