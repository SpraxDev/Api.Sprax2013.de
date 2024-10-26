import { jest } from '@jest/globals';
import * as PrismaClient from '@prisma/client';
import { DeepMockProxy } from 'jest-mock-extended';
import DatabaseClient from '../../../../../src/database/DatabaseClient.js';
import SkinPersister from '../../../../../src/minecraft/persistance/base/SkinPersister.js';
import { createStrictDeepMock } from '../../../../test-helpers.js';

let databaseClient: DeepMockProxy<DatabaseClient>;
let databaseTransaction: DeepMockProxy<PrismaClient.PrismaClient>;
let skinPersister: SkinPersister;

beforeEach(() => {
  databaseTransaction = createStrictDeepMock<PrismaClient.PrismaClient>({});
  databaseClient = createStrictDeepMock<DatabaseClient>({
    $transaction: jest.fn<any>().mockImplementation((fn: any) => fn(databaseTransaction))
  });

  skinPersister = new SkinPersister(databaseClient);
});

describe('#persist', () => {
  const originalSkinUrl = 'https://textures.minecraft.net/texture/cc69184e66d39fc1f5ed11a5e19e250a0561c289bf8bdb69362b11bc7fc659c1';
  const originalSkinPng = Buffer.from('original png');
  const normalizedSkinPng = Buffer.from('normalized png');
  const originalSkinPngSha256 = Buffer.from('221a3846999ede62036834268242f9d8a4e5a950edb55aaf3116d1d9ce9538a9', 'hex');
  const normalizedSkinPngSha256 = Buffer.from('26ce966193b11bbae74479ddc43db0462c77962d2235fdaa6a7fb0a1a912f34c', 'hex');

  test('Throw when trying to persist with an unofficial skin URL', async () => {
    await expect(skinPersister.persist(originalSkinPng, normalizedSkinPng, 'https://minecraft.example.com/skin.png')).rejects.toThrow('Expecting an official skin URL');
    expect(databaseClient.$transaction).toHaveBeenCalledTimes(0);
  });

  test('Persisting an skin image with known URL does not write to the database', async () => {
    databaseTransaction.skinUrl.findUnique.mockResolvedValue({ skinId: 123n } satisfies Pick<PrismaClient.SkinUrl, 'skinId'> as any);

    await expect(skinPersister.persist(originalSkinPng, normalizedSkinPng, originalSkinUrl)).resolves.toBe(123n);

    expect(databaseClient.$transaction).toHaveBeenCalledTimes(1);
    expect(databaseTransaction.skinUrl.findUnique).toHaveBeenCalledTimes(1);
    expect(databaseTransaction.skinUrl.findUnique).toHaveBeenCalledWith({
      where: {
        url: originalSkinUrl
      },
      select: { skinId: true }
    } satisfies PrismaClient.Prisma.SkinUrlFindUniqueArgs);
  });

  test('Persist a new skin image (PNGs only)', async () => {
    databaseTransaction.skin.findUnique.mockResolvedValue(null);
    databaseTransaction.skin.create.mockResolvedValue({ id: 123n } satisfies Pick<PrismaClient.Skin, 'id'> as any);

    await expect(skinPersister.persist(originalSkinPng, normalizedSkinPng, null)).resolves.toBe(123n);

    expect(databaseClient.$transaction).toHaveBeenCalledTimes(1);

    expect(databaseTransaction.skin.findUnique).toHaveBeenCalledTimes(1);
    expect(databaseTransaction.skin.findUnique).toHaveBeenCalledWith({
      where: {
        imageSha256: originalSkinPngSha256
      },
      select: { id: true }
    } satisfies PrismaClient.Prisma.SkinFindUniqueArgs);

    expect(databaseTransaction.skin.create).toHaveBeenCalledTimes(1);
    expect(databaseTransaction.skin.create).toHaveBeenCalledWith({
      data: {
        imageSha256: originalSkinPngSha256,
        imageBytes: originalSkinPng,
        normalizedSkin: {
          connectOrCreate: {
            where: { imageSha256: normalizedSkinPngSha256 },
            create: {
              imageSha256: normalizedSkinPngSha256,
              imageBytes: normalizedSkinPng
            }
          }
        },
        skinUrls: undefined
      },
      select: { id: true }
    } satisfies PrismaClient.Prisma.SkinCreateArgs);
  });

  test('Persist a new skin image (PNGs and URL)', async () => {
    databaseTransaction.skin.findUnique.mockResolvedValue(null);
    databaseTransaction.skinUrl.findUnique.mockResolvedValue(null);
    databaseTransaction.skin.create.mockResolvedValue({ id: 123n } satisfies Pick<PrismaClient.Skin, 'id'> as any);

    await expect(skinPersister.persist(originalSkinPng, normalizedSkinPng, originalSkinUrl)).resolves.toBe(123n);

    expect(databaseClient.$transaction).toHaveBeenCalledTimes(1);

    expect(databaseTransaction.skin.findUnique).toHaveBeenCalledTimes(1);
    expect(databaseTransaction.skin.findUnique).toHaveBeenCalledWith({
      where: {
        imageSha256: originalSkinPngSha256
      },
      select: { id: true }
    } satisfies PrismaClient.Prisma.SkinFindUniqueArgs);

    expect(databaseTransaction.skin.create).toHaveBeenCalledTimes(1);
    expect(databaseTransaction.skin.create).toHaveBeenCalledWith({
      data: {
        imageSha256: originalSkinPngSha256,
        imageBytes: originalSkinPng,
        normalizedSkin: {
          connectOrCreate: {
            where: { imageSha256: normalizedSkinPngSha256 },
            create: {
              imageSha256: normalizedSkinPngSha256,
              imageBytes: normalizedSkinPng
            }
          }
        },
        skinUrls: {
          create: {
            url: originalSkinUrl,
            textureValue: undefined,
            textureSignature: undefined,
            createdAt: undefined
          }
        }
      },
      select: { id: true }
    } satisfies PrismaClient.Prisma.SkinCreateArgs);
  });

  test('Persist a new skin image (PNGs and TextureValue)', async () => {
    const textureValue = Buffer.from('{\n' +
      '  "timestamp" : 1724858950646,\n' +
      '  "profileId" : "955e4cf6411c40d1a1765bc8e03a8a9a",\n' +
      '  "profileName" : "SpraxDev",\n' +
      '  "signatureRequired" : true,\n' +
      '  "textures" : {\n' +
      '    "SKIN" : {\n' +
      '      "url" : "https://textures.minecraft.net/texture/cc69184e66d39fc1f5ed11a5e19e250a0561c289bf8bdb69362b11bc7fc659c1",\n' +
      '      "metadata" : {\n' +
      '        "model" : "slim"\n' +
      '      }\n' +
      '    }\n' +
      '  }\n' +
      '}').toString('base64');
    const textureSignature = Buffer.from('a signature').toString('base64');
    const textureProperty = { value: textureValue, signature: textureSignature };

    databaseTransaction.skin.findUnique.mockResolvedValue(null);
    databaseTransaction.skinUrl.findUnique.mockResolvedValue(null);
    databaseTransaction.skin.create.mockResolvedValue({ id: 123n } satisfies Pick<PrismaClient.Skin, 'id'> as any);

    await expect(skinPersister.persist(originalSkinPng, normalizedSkinPng, textureProperty)).resolves.toBe(123n);

    expect(databaseClient.$transaction).toHaveBeenCalledTimes(1);

    expect(databaseTransaction.skin.findUnique).toHaveBeenCalledTimes(1);
    expect(databaseTransaction.skin.findUnique).toHaveBeenCalledWith({
      where: {
        imageSha256: originalSkinPngSha256
      },
      select: { id: true }
    } satisfies PrismaClient.Prisma.SkinFindUniqueArgs);

    expect(databaseTransaction.skin.create).toHaveBeenCalledTimes(1);
    expect(databaseTransaction.skin.create).toHaveBeenCalledWith({
      data: {
        imageSha256: originalSkinPngSha256,
        imageBytes: originalSkinPng,
        normalizedSkin: {
          connectOrCreate: {
            where: { imageSha256: normalizedSkinPngSha256 },
            create: {
              imageSha256: normalizedSkinPngSha256,
              imageBytes: normalizedSkinPng
            }
          }
        },
        skinUrls: {
          create: {
            url: originalSkinUrl,
            textureValue: textureValue,
            textureSignature: textureSignature,
            createdAt: new Date('2024-08-28T15:29:10.646Z')
          }
        }
      },
      select: { id: true }
    } satisfies PrismaClient.Prisma.SkinCreateArgs);
  });

  test('Persist a new skin image (PNGs and TextureValue without skin URL)', async () => {
    const textureValue = Buffer.from('{\n' +
      '  "timestamp" : 1724859887652,\n' +
      '  "profileId" : "61699b2ed3274a019f1e0ea8c3f06bc6",\n' +
      '  "profileName" : "Dinnerbone",\n' +
      '  "textures" : {\n' +
      '    "CAPE" : {\n' +
      '      "url" : "https://textures.minecraft.net/texture/cd9d82ab17fd92022dbd4a86cde4c382a7540e117fae7b9a2853658505a80625"\n' +
      '    }\n' +
      '  }\n' +
      '}').toString('base64');
    const textureSignature = Buffer.from('a signature').toString('base64');
    const textureProperty = { value: textureValue, signature: textureSignature };

    databaseTransaction.skin.findUnique.mockResolvedValue(null);
    databaseTransaction.skinUrl.findUnique.mockResolvedValue(null);
    databaseTransaction.skin.create.mockResolvedValue({ id: 123n } satisfies Pick<PrismaClient.Skin, 'id'> as any);

    await expect(skinPersister.persist(originalSkinPng, normalizedSkinPng, textureProperty)).resolves.toBe(123n);

    expect(databaseClient.$transaction).toHaveBeenCalledTimes(1);

    expect(databaseTransaction.skin.findUnique).toHaveBeenCalledTimes(1);
    expect(databaseTransaction.skin.findUnique).toHaveBeenCalledWith({
      where: {
        imageSha256: originalSkinPngSha256
      },
      select: { id: true }
    } satisfies PrismaClient.Prisma.SkinFindUniqueArgs);

    expect(databaseTransaction.skin.create).toHaveBeenCalledTimes(1);
    expect(databaseTransaction.skin.create).toHaveBeenCalledWith({
      data: {
        imageSha256: originalSkinPngSha256,
        imageBytes: originalSkinPng,
        normalizedSkin: {
          connectOrCreate: {
            where: { imageSha256: normalizedSkinPngSha256 },
            create: {
              imageSha256: normalizedSkinPngSha256,
              imageBytes: normalizedSkinPng
            }
          }
        },
        skinUrls: undefined
      },
      select: { id: true }
    } satisfies PrismaClient.Prisma.SkinCreateArgs);
  });

  test('Persist a known skin image with new URL', async () => {
    databaseTransaction.skin.findUnique.mockResolvedValue({ id: 123n } satisfies Pick<PrismaClient.Skin, 'id'> as any);
    databaseTransaction.skinUrl.findUnique.mockResolvedValue(null);
    databaseTransaction.skinUrl.create.mockResolvedValue({ skinId: 123n } satisfies Pick<PrismaClient.SkinUrl, 'skinId'> as any);

    await expect(skinPersister.persist(originalSkinPng, normalizedSkinPng, originalSkinUrl)).resolves.toBe(123n);

    expect(databaseClient.$transaction).toHaveBeenCalledTimes(1);

    expect(databaseTransaction.skin.findUnique).toHaveBeenCalledTimes(1);
    expect(databaseTransaction.skin.findUnique).toHaveBeenCalledWith({
      where: {
        imageSha256: originalSkinPngSha256
      },
      select: { id: true }
    } satisfies PrismaClient.Prisma.SkinFindUniqueArgs);

    expect(databaseTransaction.skinUrl.create).toHaveBeenCalledTimes(1);
    expect(databaseTransaction.skinUrl.create).toHaveBeenCalledWith({
      data: {
        url: originalSkinUrl,
        textureValue: undefined,
        textureSignature: undefined,
        skinId: 123n,
        createdAt: undefined
      },
      select: { skinId: true }
    } satisfies PrismaClient.Prisma.SkinUrlCreateArgs);
  });

  test('Persisting a skin image with identical normalized skin image does not write both to the database', async () => {
    databaseTransaction.skin.findUnique.mockResolvedValue(null);
    databaseTransaction.skin.create.mockResolvedValue({ id: 123n } satisfies Pick<PrismaClient.Skin, 'id'> as any);

    await expect(skinPersister.persist(normalizedSkinPng, normalizedSkinPng, null)).resolves.toBe(123n);

    expect(databaseClient.$transaction).toHaveBeenCalledTimes(1);

    expect(databaseTransaction.skin.findUnique).toHaveBeenCalledTimes(1);
    expect(databaseTransaction.skin.findUnique).toHaveBeenCalledWith({
      where: {
        imageSha256: normalizedSkinPngSha256
      },
      select: { id: true }
    } satisfies PrismaClient.Prisma.SkinFindUniqueArgs);

    expect(databaseTransaction.skin.create).toHaveBeenCalledTimes(1);
    expect(databaseTransaction.skin.create).toHaveBeenCalledWith({
      data: {
        imageSha256: normalizedSkinPngSha256,
        imageBytes: normalizedSkinPng,
        normalizedSkin: undefined,
        skinUrls: undefined
      },
      select: { id: true }
    } satisfies PrismaClient.Prisma.SkinCreateArgs);
  });
});
