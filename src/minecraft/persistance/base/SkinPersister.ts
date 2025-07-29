import Crypto from 'node:crypto';
import { singleton } from 'tsyringe';
import DatabaseClient from '../../../database/DatabaseClient.js';
import ImageManipulator from '../../image/ImageManipulator.js';
import MinecraftProfileTextures from '../../value-objects/MinecraftProfileTextures.js';

@singleton()
export default class SkinPersister {
  constructor(
    private readonly databaseClient: DatabaseClient,
  ) {
  }

  async persist(
    originalSkinPng: Buffer,
    normalizedSkinPng: Buffer,
    skinUrlOrTextureProperty: string | { value: string, signature: string } | null,
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

    if (skinUrl != null && !MinecraftProfileTextures.isOfficialTextureUrl(skinUrl)) {
      throw new Error('Expecting an official skin URL');
    }

    //noinspection ES6RedundantAwait
    return await this.databaseClient.$transaction(async (transaction): Promise<bigint> => {
      if (skinUrl != null) {
        const existingSkinByUrl = await transaction.skinUrl.findUnique({
          where: { url: skinUrl },
          select: { skinId: true },
        });
        if (existingSkinByUrl != null) {
          return existingSkinByUrl.skinId;
        }
      }

      const originalPixelDataHash = await this.computePixelDataHash(originalSkinPng);
      const normalizedPixelDataHash = await this.computePixelDataHash(normalizedSkinPng);

      const lockId = Crypto
        .createHash('sha256')
        .update(originalSkinPng)
        .digest()
        .readInt32BE();
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(${lockId})`;

      const existingSkin = await transaction.skin.findUnique({
        select: { id: true },
        where: { pixelDataHash: originalPixelDataHash },
      });
      if (existingSkin != null) {
        if (skinUrl != null) {
          await transaction.skinUrl.create({
            data: {
              url: skinUrl,
              textureValue,
              textureSignature,
              skinId: existingSkin.id,
              createdAt,
            },
            select: { skinId: true },
          });
        }
        return existingSkin.id;
      }

      const persistedSkin = await transaction.skin.create({
        data: {
          pixelDataHash: originalPixelDataHash,
          imageBytes: originalSkinPng,
          normalizedSkin: !originalPixelDataHash.equals(normalizedPixelDataHash) ? {
            connectOrCreate: {
              where: { pixelDataHash: normalizedPixelDataHash },
              create: {
                pixelDataHash: normalizedPixelDataHash,
                imageBytes: normalizedSkinPng,
              },
            },
          } : undefined,

          skinUrls: skinUrl ? {
            create: {
              url: skinUrl,
              textureValue,
              textureSignature,
              createdAt,
            },
          } : undefined,
        },
        select: { id: true },
      });
      return persistedSkin.id;
    });
  }

  private async computePixelDataHash(buffer: Buffer): Promise<Buffer> {
    return (await ImageManipulator.createByImage(buffer)).calculatePixelDataHashXXH128();
  }
}
