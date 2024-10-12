import { DeepMockProxy, mockDeep } from 'jest-mock-extended';
import AutoProxiedHttpClient from '../../../../../src/http/clients/AutoProxiedHttpClient.js';
import HttpResponse from '../../../../../src/http/HttpResponse.js';
import { CapeResponse } from '../../../../../src/minecraft/cape/provider/CapeProvider.js';
import LabymodCapeProvider from '../../../../../src/minecraft/cape/provider/LabymodCapeProvider.js';
import { EXISTING_MC_ID_WITH_HYPHENS, EXISTING_MC_PROFILE } from '../../../../test-constants.js';

describe('LabymodCapeProvider', () => {
  let httpClient: DeepMockProxy<AutoProxiedHttpClient>;
  let capeProvider: LabymodCapeProvider;

  beforeEach(() => {
    httpClient = mockDeep<AutoProxiedHttpClient>();
    capeProvider = new LabymodCapeProvider(httpClient);
  });

  test('returned capeType is labymod', () => {
    expect(capeProvider.capeType).toBe('LABYMOD');
  });

  test('Returns null when a user has no cape', async () => {
    httpClient.get.mockResolvedValue(new HttpResponse(404, new Map(), Buffer.from('<html>\n<head><title>404 Not Found</title></head>\n<body>\n<center><h1>404 Not Found</h1></center>\n<hr><center>openresty</center>\n</body>\n</html>\n')));

    await expect(capeProvider.provide(EXISTING_MC_PROFILE)).resolves.toBeNull();
    expect(httpClient.get).toHaveBeenCalledWith(`https://dl.labymod.net/capes/${EXISTING_MC_ID_WITH_HYPHENS}`);
  });

  test('Returns null when the response body is empty', async () => {
    httpClient.get.mockResolvedValue(new HttpResponse(200, new Map([['content-type', 'application/octet-stream']]), Buffer.from('')));

    await expect(capeProvider.provide(EXISTING_MC_PROFILE)).resolves.toBeNull();
    expect(httpClient.get).toHaveBeenCalledWith(`https://dl.labymod.net/capes/${EXISTING_MC_ID_WITH_HYPHENS}`);
  });

  test('Throws an exception on unknown response status code', async () => {
    httpClient.get.mockResolvedValue(new HttpResponse(500, new Map(), Buffer.from('Internal Server Error')));

    await expect(capeProvider.provide(EXISTING_MC_PROFILE)).rejects.toThrow('(status code 500)');
    expect(httpClient.get).toHaveBeenCalledWith(`https://dl.labymod.net/capes/${EXISTING_MC_ID_WITH_HYPHENS}`);
  });

  test('Returns the response body when a user has a cape', async () => {
    httpClient.get.mockResolvedValue(new HttpResponse(200, new Map([['content-type', 'application/octet-stream']]), Buffer.from('A PNG')));

    await expect(capeProvider.provide(EXISTING_MC_PROFILE)).resolves.toEqual<CapeResponse>({
      image: Buffer.from('A PNG'),
      mimeType: 'image/png',
      ageInSeconds: 0
    });
    expect(httpClient.get).toHaveBeenCalledWith(`https://dl.labymod.net/capes/${EXISTING_MC_ID_WITH_HYPHENS}`);
  });
});
