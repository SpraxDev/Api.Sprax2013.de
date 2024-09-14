import { DeepMockProxy, mockDeep } from 'jest-mock-extended';
import AutoProxiedHttpClient from '../../../src/http/clients/AutoProxiedHttpClient.js';
import HttpResponse from '../../../src/http/HttpResponse.js';
import MinecraftApiClient, { UsernameToUuidResponse } from '../../../src/minecraft/MinecraftApiClient.js';
import { EXISTING_MC_ID, EXISTING_MC_NAME, EXISTING_MC_PROFILE_RESPONSE } from '../../test-constants.js';

let httpClient: DeepMockProxy<AutoProxiedHttpClient>;
let minecraftApiClient: MinecraftApiClient;

beforeEach(() => {
  httpClient = mockDeep<AutoProxiedHttpClient>();
  minecraftApiClient = new MinecraftApiClient(httpClient);
});

describe('#fetchUuidForUsername', () => {
  test(`Returns the remote API's body`, async () => {
    const expectedResponse = { id: EXISTING_MC_ID, name: EXISTING_MC_NAME } satisfies UsernameToUuidResponse;
    httpClient.get.mockResolvedValue(new HttpResponse(200, new Map(), Buffer.from(JSON.stringify(expectedResponse))));

    await expect(minecraftApiClient.fetchUuidForUsername(EXISTING_MC_NAME)).resolves.toEqual(expectedResponse);
    expect(httpClient.get).toHaveBeenCalledWith(`https://api.minecraftservices.com/minecraft/profile/lookup/name/${EXISTING_MC_NAME}`);
  });

  test.each([204, 404])('Returns null when API responds with status code %j', async (statusCode: number) => {
    httpClient.get.mockResolvedValue(new HttpResponse(statusCode, new Map(), Buffer.from('anything')));

    await expect(minecraftApiClient.fetchUuidForUsername(EXISTING_MC_NAME)).resolves.toBeNull();
    expect(httpClient.get).toHaveBeenCalledWith(`https://api.minecraftservices.com/minecraft/profile/lookup/name/${EXISTING_MC_NAME}`);
  });

  test.each([400, 429, 500])('Throws an exception on unexpected response status code of %j', async (statusCode: number) => {
    httpClient.get.mockResolvedValue(new HttpResponse(statusCode, new Map(), Buffer.from('some error')));

    await expect(minecraftApiClient.fetchUuidForUsername(EXISTING_MC_NAME)).rejects.toThrow(`Failed to get UUID for username '${EXISTING_MC_NAME}': {status=${statusCode}, body=some error}`);
    expect(httpClient.get).toHaveBeenCalledWith(`https://api.minecraftservices.com/minecraft/profile/lookup/name/${EXISTING_MC_NAME}`);
  });
});

describe('#fetchProfileForUuid', () => {
  test(`Returns the remote API's body`, async () => {
    httpClient.get.mockResolvedValue(new HttpResponse(200, new Map(), Buffer.from(JSON.stringify(EXISTING_MC_PROFILE_RESPONSE))));

    await expect(minecraftApiClient.fetchProfileForUuid(EXISTING_MC_ID)).resolves.toEqual(EXISTING_MC_PROFILE_RESPONSE);
    expect(httpClient.get).toHaveBeenCalledWith(`https://sessionserver.mojang.com/session/minecraft/profile/${EXISTING_MC_ID}?unsigned=false`);
  });

  test.each([204, 404])('Returns null when API responds with status code %j', async (statusCode: number) => {
    httpClient.get.mockResolvedValue(new HttpResponse(statusCode, new Map(), Buffer.from('anything')));

    await expect(minecraftApiClient.fetchProfileForUuid(EXISTING_MC_ID)).resolves.toBeNull();
    expect(httpClient.get).toHaveBeenCalledWith(`https://sessionserver.mojang.com/session/minecraft/profile/${EXISTING_MC_ID}?unsigned=false`);
  });

  test.each([400, 429, 500])('Throws an exception on unexpected response status code of %j', async (statusCode: number) => {
    httpClient.get.mockResolvedValue(new HttpResponse(statusCode, new Map(), Buffer.from('some error')));

    await expect(minecraftApiClient.fetchProfileForUuid(EXISTING_MC_ID)).rejects.toThrow(`Failed to get profile for UUID '${EXISTING_MC_ID}': {status=${statusCode}, body=some error}`);
    expect(httpClient.get).toHaveBeenCalledWith(`https://sessionserver.mojang.com/session/minecraft/profile/${EXISTING_MC_ID}?unsigned=false`);
  });
});

describe('#fetchListOfBlockedServers', () => {
  test('Returns a parsed array on success', async () => {
    const expectedList = [
      'a'.repeat(40),
      'b'.repeat(40),
      'c'.repeat(40)
    ];
    httpClient.get.mockResolvedValue(new HttpResponse(200, new Map(), Buffer.from(expectedList.join('\n') + '\n')));

    await expect(minecraftApiClient.fetchListOfBlockedServers()).resolves.toEqual(expectedList);
    expect(httpClient.get).toHaveBeenCalledWith('https://sessionserver.mojang.com/blockedservers', { headers: { Accept: 'text/plain' } });
  });

  test('Throws an exception if one of the lines is not as long as a SHA-1 hash', async () => {
    const expectedList = [
      'a'.repeat(40),
      'b'.repeat(41),
      'c'.repeat(40)
    ];
    httpClient.get.mockResolvedValue(new HttpResponse(200, new Map(), Buffer.from(expectedList.join('\n') + '\n')));

    await expect(minecraftApiClient.fetchListOfBlockedServers()).rejects.toThrow('Failed to get list of blocked servers: One or more lines are not valid SHA-1 hashes');
    expect(httpClient.get).toHaveBeenCalledWith('https://sessionserver.mojang.com/blockedservers', { headers: { Accept: 'text/plain' } });
  });

  test.each([400, 404, 429, 500])('Throws an exception on unexpected response status code of %j', async (statusCode: number) => {
    httpClient.get.mockResolvedValue(new HttpResponse(statusCode, new Map(), Buffer.from('some error')));

    await expect(minecraftApiClient.fetchListOfBlockedServers()).rejects.toThrow(`Failed to get list of blocked servers: {status=${statusCode}, body=some error}`);
    expect(httpClient.get).toHaveBeenCalledWith('https://sessionserver.mojang.com/blockedservers', { headers: { Accept: 'text/plain' } });
  });
});
