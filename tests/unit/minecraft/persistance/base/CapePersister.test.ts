import * as PrismaClient from '@prisma/client';
import { DeepMockProxy } from 'vitest-mock-extended';
import { vitest } from 'vitest';
import DatabaseClient from '../../../../../src/database/DatabaseClient.js';
import CapePersister from '../../../../../src/minecraft/persistance/base/CapePersister.js';
import { readTestResource } from '../../../../resources/resources.js';
import { createStrictDeepMock } from '../../../../test-helpers.js';

let databaseClient: DeepMockProxy<DatabaseClient>;
let databaseTransaction: DeepMockProxy<PrismaClient.PrismaClient>;
let capePersister: CapePersister;

beforeEach(() => {
  databaseTransaction = createStrictDeepMock<PrismaClient.PrismaClient>({
    profileSeenCape: {
      upsert: vitest.fn<any>().mockResolvedValue(undefined),
    },
  });
  databaseClient = createStrictDeepMock<DatabaseClient>({
    $transaction: vitest.fn<any>().mockImplementation((fn: any) => fn(databaseTransaction)),
  });

  capePersister = new CapePersister(databaseClient);
});

describe('#persistGenericCape', () => {
  const capeImage = readTestResource('capes/OptiFine.png');
  const capePixelDataHash = Buffer.from('20de1b0d249a9ee22e857b379e1eb623', 'hex');

  test('Throws for MOJANG capes', async () => {
    await expect(capePersister.persistGenericCape('MOJANG', Buffer.from('A PNG'), 'image/png')).rejects.toThrow('persisting MOJANG capes has to be done with #persistMojangCape');
    expect(databaseClient.$transaction).toHaveBeenCalledTimes(0);
  });

  test('Persisting a known cape does not write to the database', async () => {
    databaseTransaction.cape.findUnique.mockResolvedValue({ id: 123n } satisfies Pick<PrismaClient.Cape, 'id'> as any);

    await expect(capePersister.persistGenericCape('OPTIFINE', await capeImage, 'image/png')).resolves.toBe(123n);

    expect(databaseClient.$transaction).toHaveBeenCalledTimes(1);
    expect(databaseTransaction.cape.findUnique).toHaveBeenCalledTimes(1);
    expect(databaseTransaction.cape.findUnique).toHaveBeenCalledWith({
      where: {
        type_pixelDataHash: {
          type: 'OPTIFINE',
          pixelDataHash: capePixelDataHash,
        },
      },
      select: { id: true },
    } satisfies PrismaClient.Prisma.CapeFindUniqueArgs);
  });

  test.each([
    'OPTIFINE',
    'LABYMOD',
  ] satisfies PrismaClient.CapeType[])('Persisting a new cape', async (capeType: PrismaClient.CapeType) => {
    databaseTransaction.cape.findUnique.mockResolvedValue(null);
    databaseTransaction.cape.create.mockResolvedValue({ id: 123n } satisfies Pick<PrismaClient.Cape, 'id'> as any);

    await expect(capePersister.persistGenericCape(capeType, await capeImage, 'image/jpeg')).resolves.toBe(123n);

    expect(databaseClient.$transaction).toHaveBeenCalledTimes(1);

    expect(databaseTransaction.cape.findUnique).toHaveBeenCalledTimes(1);
    expect(databaseTransaction.cape.findUnique).toHaveBeenCalledWith({
      where: {
        type_pixelDataHash: {
          type: capeType,
          pixelDataHash: capePixelDataHash,
        },
      },
      select: { id: true },
    } satisfies PrismaClient.Prisma.CapeFindUniqueArgs);

    expect(databaseTransaction.cape.create).toHaveBeenCalledTimes(1);
    expect(databaseTransaction.cape.create).toHaveBeenCalledWith({
      data: {
        type: capeType,
        pixelDataHash: capePixelDataHash,
        imageBytes: await capeImage,
        mimeType: 'image/jpeg',
      },
      select: { id: true },
    } satisfies PrismaClient.Prisma.CapeCreateArgs);
  });
});

describe('#persistMojangCape', () => {
  const textureValueWithCape = Buffer.from('{\n' +
    '  "timestamp" : 1724859887652,\n' +
    '  "profileId" : "61699b2ed3274a019f1e0ea8c3f06bc6",\n' +
    '  "profileName" : "Dinnerbone",\n' +
    '  "textures" : {\n' +
    '    "CAPE" : {\n' +
    '      "url" : "https://textures.minecraft.net/texture/cd9d82ab17fd92022dbd4a86cde4c382a7540e117fae7b9a2853658505a80625"\n' +
    '    }\n' +
    '  }\n' +
    '}').toString('base64');
  const capeImage = readTestResource('capes/Mojang.png');
  const capePixelDataHash = Buffer.from('b24489e58d7c2d8bc1ae16e18de689a2', 'hex');

  test('Throws for textures without cape', async () => {
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

    await expect(capePersister.persistMojangCape(textureValue, Buffer.from('A PNG'))).rejects.toThrow('Cannot persist cape for texture value without cape URL');
    expect(databaseClient.$transaction).toHaveBeenCalledTimes(0);
  });

  test('Throws for textures with unofficial cape URL', async () => {
    const textureValue = Buffer.from('{\n' +
      '  "timestamp" : 1724858950646,\n' +
      '  "profileId" : "955e4cf6411c40d1a1765bc8e03a8a9a",\n' +
      '  "profileName" : "SpraxDev",\n' +
      '  "signatureRequired" : true,\n' +
      '  "textures" : {\n' +
      '    "CAPE" : {\n' +
      '      "url" : "https://minecraft.example.com/cape.png"\n' +
      '    }\n' +
      '  }\n' +
      '}').toString('base64');

    await expect(capePersister.persistMojangCape(textureValue, Buffer.from('A PNG'))).rejects.toThrow('Expecting an official cape URL in profile textures');
    expect(databaseClient.$transaction).toHaveBeenCalledTimes(0);
  });

  test('Persisting a known cape URL does not write to the database', async () => {
    databaseTransaction.capeUrl.findUnique.mockResolvedValue({ capeId: 123n } satisfies Pick<PrismaClient.CapeUrl, 'capeId'> as any);

    await expect(capePersister.persistMojangCape(textureValueWithCape, await capeImage)).resolves.toBe(123n);

    expect(databaseClient.$transaction).toHaveBeenCalledTimes(1);
    expect(databaseTransaction.capeUrl.findUnique).toHaveBeenCalledTimes(1);
    expect(databaseTransaction.capeUrl.findUnique).toHaveBeenCalledWith({
      where: { url: 'https://textures.minecraft.net/texture/cd9d82ab17fd92022dbd4a86cde4c382a7540e117fae7b9a2853658505a80625' },
      select: { capeId: true },
    } satisfies PrismaClient.Prisma.CapeUrlFindUniqueArgs);
  });

  test('Persisting a new cape URL', async () => {
    databaseTransaction.capeUrl.findUnique.mockResolvedValue(null);
    databaseTransaction.cape.findUnique.mockResolvedValue(null);
    databaseTransaction.cape.create.mockResolvedValue({ id: 123n } satisfies Pick<PrismaClient.Cape, 'id'> as any);

    await expect(capePersister.persistMojangCape(textureValueWithCape, await capeImage)).resolves.toBe(123n);

    expect(databaseClient.$transaction).toHaveBeenCalledTimes(1);
    expect(databaseTransaction.capeUrl.findUnique).toHaveBeenCalledTimes(1);
    expect(databaseTransaction.cape.findUnique).toHaveBeenCalledTimes(1);

    expect(databaseTransaction.cape.create).toHaveBeenCalledTimes(1);
    expect(databaseTransaction.cape.create).toHaveBeenCalledWith({
      data: {
        type: 'MOJANG',
        pixelDataHash: capePixelDataHash,
        imageBytes: await capeImage,
        mimeType: 'image/png',
        capeUrls: {
          create: {
            url: 'https://textures.minecraft.net/texture/cd9d82ab17fd92022dbd4a86cde4c382a7540e117fae7b9a2853658505a80625',
          },
        },
      },
      select: { id: true },
    } satisfies PrismaClient.Prisma.CapeCreateArgs);
  });

  test('Persisting an existing cape but with a different URL', async () => {
    databaseTransaction.capeUrl.findUnique.mockResolvedValue(null);
    databaseTransaction.cape.findUnique.mockResolvedValue({ id: 123n } satisfies Pick<PrismaClient.Cape, 'id'> as any);
    databaseTransaction.capeUrl.create.mockResolvedValue({ capeId: 123n } satisfies Pick<PrismaClient.CapeUrl, 'capeId'> as any);

    await expect(capePersister.persistMojangCape(textureValueWithCape, await capeImage)).resolves.toBe(123n);

    expect(databaseClient.$transaction).toHaveBeenCalledTimes(1);
    expect(databaseTransaction.capeUrl.findUnique).toHaveBeenCalledTimes(1);
    expect(databaseTransaction.cape.findUnique).toHaveBeenCalledTimes(1);

    expect(databaseTransaction.capeUrl.create).toHaveBeenCalledTimes(1);
    expect(databaseTransaction.capeUrl.create).toHaveBeenCalledWith({
      data: {
        url: 'https://textures.minecraft.net/texture/cd9d82ab17fd92022dbd4a86cde4c382a7540e117fae7b9a2853658505a80625',
        capeId: 123n,
      },
      select: { capeId: true },
    } satisfies PrismaClient.Prisma.CapeUrlCreateArgs);
  });
});
