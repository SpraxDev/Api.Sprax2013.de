import { DeepMockProxy, mockDeep } from 'jest-mock-extended';
import HttpClient from '../../../../../src/http/HttpClient.js';
import HttpResponse from '../../../../../src/http/HttpResponse.js';
import OptifineCapeProvider from '../../../../../src/minecraft/cape/provider/OptifineCapeProvider.js';
import { EXISTING_MC_NAME, EXISTING_MC_PROFILE } from '../../../../test-constants.js';

describe('OptiFineCapeProvider', () => {
  let httpClient: DeepMockProxy<HttpClient>;
  let capeProvider: OptifineCapeProvider;

  beforeEach(() => {
    httpClient = mockDeep<HttpClient>();
    capeProvider = new OptifineCapeProvider(httpClient);
  });

  test('returned capeType is optifine', () => {
    expect(capeProvider.capeType).toBe('optifine');
  });

  test('Returns null when a user has no cape', async () => {
    httpClient.get.mockResolvedValue(new HttpResponse(404, new Map(), Buffer.from('<html>\n<body>\nNot found\n</body>\n</html>')));

    await expect(capeProvider.provide(EXISTING_MC_PROFILE)).resolves.toBeNull();
    expect(httpClient.get).toHaveBeenCalledWith(`http://s.optifine.net/capes/${EXISTING_MC_NAME}.png`);
  });

  test('Throws an exception on unknown response status code', async () => {
    httpClient.get.mockResolvedValue(new HttpResponse(500, new Map(), Buffer.from('Internal Server Error')));

    await expect(capeProvider.provide(EXISTING_MC_PROFILE)).rejects.toThrow('(status code 500)');
    expect(httpClient.get).toHaveBeenCalledWith(`http://s.optifine.net/capes/${EXISTING_MC_NAME}.png`);
  });

  test('Throws an exception on success response with wrong Content-Type header', async () => {
    httpClient.get.mockResolvedValue(new HttpResponse(200, new Map([['content-type', 'text/html']]), Buffer.from('Not a PNG')));

    await expect(capeProvider.provide(EXISTING_MC_PROFILE)).rejects.toThrow('Content-Type is not image/png (got text/html)');
    expect(httpClient.get).toHaveBeenCalledWith(`http://s.optifine.net/capes/${EXISTING_MC_NAME}.png`);
  });

  test('Returns the response body when a user has a cape', async () => {
    httpClient.get.mockResolvedValue(new HttpResponse(200, new Map([['content-type', 'image/png']]), Buffer.from('A PNG')));

    await expect(capeProvider.provide(EXISTING_MC_PROFILE)).resolves.toEqual({
      image: Buffer.from('A PNG'),
      mimeType: 'image/png'
    });
    expect(httpClient.get).toHaveBeenCalledWith(`http://s.optifine.net/capes/${EXISTING_MC_NAME}.png`);
  });
});
