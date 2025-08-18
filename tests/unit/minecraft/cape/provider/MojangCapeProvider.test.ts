import * as PrismaClient from '@prisma/client';
import { CapeType } from '@prisma/client';
import { HttpResponse } from '@spraxdev/node-commons/http';
import { DeepMockProxy, mockDeep } from 'jest-mock-extended';
import AutoProxiedHttpClient from '../../../../../src/http/clients/AutoProxiedHttpClient.js';
import CapeCache from '../../../../../src/minecraft/cape/CapeCache.js';
import { CapeResponse } from '../../../../../src/minecraft/cape/provider/CapeProvider.js';
import MojangCapeProvider from '../../../../../src/minecraft/cape/provider/MojangCapeProvider.js';
import MinecraftProfile from '../../../../../src/minecraft/value-objects/MinecraftProfile.js';
import { EXISTING_MC_PROFILE } from '../../../../test-constants.js';

const profileWithCape = new MinecraftProfile({
  id: '61699b2ed3274a019f1e0ea8c3f06bc6',
  name: 'Dinnerbone',
  properties: [{
    name: 'textures',
    value: Buffer.from('{\n' +
      '  "timestamp" : 1724859887652,\n' +
      '  "profileId" : "61699b2ed3274a019f1e0ea8c3f06bc6",\n' +
      '  "profileName" : "Dinnerbone",\n' +
      '  "textures" : {\n' +
      '    "CAPE" : {\n' +
      '      "url" : "http://textures.minecraft.net/texture/cd9d82ab17fd92022dbd4a86cde4c382a7540e117fae7b9a2853658505a80625"\n' +
      '    }\n' +
      '  }\n' +
      '}').toString('base64'),
    signature: 'some-signature',
  }],
  profileActions: [],
});

describe('MojangCapeProvider', () => {
  let httpClient: DeepMockProxy<AutoProxiedHttpClient>;
  let capeCache: DeepMockProxy<CapeCache>;
  let capeProvider: MojangCapeProvider;

  beforeEach(() => {
    httpClient = mockDeep<AutoProxiedHttpClient>();
    capeCache = mockDeep<CapeCache>({
      fallbackMockImplementation: () => {
        throw new Error('Not implemented');
      },
    });
    capeProvider = new MojangCapeProvider(httpClient, capeCache);
  });

  test('returned capeType is mojang', () => {
    expect(capeProvider.capeType).toBe('MOJANG');
  });

  test('Returns null when a user has no cape', async () => {
    capeCache.findByTypeAndUrl.mockResolvedValue(null);

    await expect(capeProvider.provide(EXISTING_MC_PROFILE)).resolves.toBeNull();
    expect(httpClient.get).not.toHaveBeenCalled();
  });

  test('Throws an exception on unknown response status code', async () => {
    capeCache.findByTypeAndUrl.mockResolvedValue(null);
    httpClient.get.mockResolvedValue(new HttpResponse(500, new Map(), Buffer.from('Internal Server Error')));

    await expect(capeProvider.provide(profileWithCape)).rejects.toThrow('(status code 500)');
    expect(httpClient.get).toHaveBeenCalledWith(`https://textures.minecraft.net/texture/cd9d82ab17fd92022dbd4a86cde4c382a7540e117fae7b9a2853658505a80625`);
  });

  test.each([
    'text/html',
    '',
  ])('Throws an exception on success response with wrong Content-Type: %j', async (responseType: string) => {
    capeCache.findByTypeAndUrl.mockResolvedValue(null);
    httpClient.get.mockResolvedValue(new HttpResponse(200, new Map(responseType ? [['content-type', responseType]] : []), Buffer.from('Not a PNG')));

    await expect(capeProvider.provide(profileWithCape)).rejects.toThrow(`Content-Type is not image/png (or application/octet-stream) (got ${responseType})`);
    expect(httpClient.get).toHaveBeenCalledWith(`https://textures.minecraft.net/texture/cd9d82ab17fd92022dbd4a86cde4c382a7540e117fae7b9a2853658505a80625`);
  });

  test.each([
    'image/png',
    'application/octet-stream',
  ])('Returns the response body when a user has a cape (Response is %j)', async (responseType: string) => {
    capeCache.findByTypeAndUrl.mockResolvedValue(null);
    httpClient.get.mockResolvedValue(new HttpResponse(200, new Map([['content-type', responseType]]), Buffer.from('A PNG')));

    await expect(capeProvider.provide(profileWithCape)).resolves.toEqual<CapeResponse>({
      image: Buffer.from('A PNG'),
      mimeType: 'image/png',
      ageInSeconds: 0,
    });
    expect(httpClient.get).toHaveBeenCalledWith(`https://textures.minecraft.net/texture/cd9d82ab17fd92022dbd4a86cde4c382a7540e117fae7b9a2853658505a80625`);
  });

  test('Returns the cape from the cache of URL is already known', async () => {
    capeCache.findByTypeAndUrl.mockResolvedValue({
      id: 123n,
      type: CapeType.MOJANG,
      pixelDataHash: Buffer.from('20de1b0d249a9ee22e857b379e1eb623', 'hex'),
      imageBytes: Buffer.from('A PNG'),
      mimeType: 'image/png',
      createdAt: new Date(),
    } satisfies PrismaClient.Cape);

    await expect(capeProvider.provide(profileWithCape)).resolves.toEqual<CapeResponse>({
      image: Buffer.from('A PNG'),
      mimeType: 'image/png',
      ageInSeconds: 0,
    });
    expect(httpClient.get).not.toHaveBeenCalled();
  });
});
