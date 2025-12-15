import { HttpResponse } from '@spraxdev/node-commons/http';
import { container } from 'tsyringe';
import { DeepMockProxy, mockDeep } from 'vitest-mock-extended';
import AutoProxiedHttpClient from '../../../src/http/clients/AutoProxiedHttpClient.js';
import type { UsernameToUuidResponse } from '../../../src/minecraft/MinecraftApiClient.js';
import MinecraftProfileService from '../../../src/minecraft/profile/MinecraftProfileService.js';
import ThirdPartyMinecraftApiClient from '../../../src/minecraft/ThirdPartyMinecraftApiClient.js';
import { EXISTING_MC_ID, EXISTING_MC_NAME, EXISTING_MC_PROFILE_RESPONSE } from '../../test-constants.js';

const THIRD_PARTY_RESPONSE_SUCCESS = {
  id: EXISTING_MC_PROFILE_RESPONSE.id,
  name: EXISTING_MC_PROFILE_RESPONSE.name,
  properties: EXISTING_MC_PROFILE_RESPONSE.properties,
};
const THIRD_PARTY_RESPONSE_NOT_FOUND = {
  error: 'User does not exist'
};
const THIRD_PARTY_RESPONSE_ERROR = {
  error: 'Some error'
};

let httpClient: DeepMockProxy<AutoProxiedHttpClient>;
let minecraftProfileService: DeepMockProxy<MinecraftProfileService>;
let thirdPartyMinecraftApiClient: ThirdPartyMinecraftApiClient;

beforeEach(() => {
  httpClient = mockDeep<AutoProxiedHttpClient>();
  minecraftProfileService = mockDeep<MinecraftProfileService>();
  thirdPartyMinecraftApiClient = new ThirdPartyMinecraftApiClient(httpClient);

  container.registerInstance(MinecraftProfileService, minecraftProfileService);
});

describe('#fetchUuidForUsername', () => {
  test(`Fetches the UUID from third-party and verifies the UUID's profile using first-party API`, async () => {
    const expectedResponse: UsernameToUuidResponse = { id: EXISTING_MC_ID, name: EXISTING_MC_NAME };
    httpClient.get.mockResolvedValue(new HttpResponse(200, new Map(), Buffer.from(JSON.stringify(THIRD_PARTY_RESPONSE_SUCCESS))));
    minecraftProfileService.provideProfileByUuid.mockResolvedValue({ profile: EXISTING_MC_PROFILE_RESPONSE, ageInSeconds: 0 });

    await expect(thirdPartyMinecraftApiClient.fetchUuidForUsername(EXISTING_MC_NAME))
      .resolves
      .toEqual(expectedResponse);

    expect(httpClient.get).toHaveBeenCalledWith(`https://crafthead.net/profile/${EXISTING_MC_NAME}`);
    expect(minecraftProfileService.provideProfileByUuid).toHaveBeenCalledTimes(1);
  });

  test.each([null, EXISTING_MC_PROFILE_RESPONSE])(`Throw when the UUID from the third-party API does not match the profile from the first-party API`, async () => {
    const thirdPartyApiResponse: typeof THIRD_PARTY_RESPONSE_SUCCESS = JSON.parse(JSON.stringify(THIRD_PARTY_RESPONSE_SUCCESS));
    thirdPartyApiResponse.name = 'a-different-name';

    httpClient.get.mockResolvedValue(new HttpResponse(200, new Map(), Buffer.from(JSON.stringify(thirdPartyApiResponse))));
    minecraftProfileService.provideProfileByUuid.mockResolvedValue({ profile: EXISTING_MC_PROFILE_RESPONSE, ageInSeconds: 0 });

    await expect(thirdPartyMinecraftApiClient.fetchUuidForUsername('a-different-name'))
      .rejects
      .toThrow(`Failed to get UUID for username 'a-different-name' from crafthead.net (Profile for returned UUID (${EXISTING_MC_ID}) does not match the requested username)`);

    expect(httpClient.get).toHaveBeenCalledWith(`https://crafthead.net/profile/a-different-name`);
    expect(minecraftProfileService.provideProfileByUuid).toHaveBeenCalledTimes(1);
  });

  test(`Returns null when API response with 'Not Found' status`, async () => {
    httpClient.get.mockResolvedValue(new HttpResponse(404, new Map(), Buffer.from(JSON.stringify(THIRD_PARTY_RESPONSE_NOT_FOUND))));

    await expect(thirdPartyMinecraftApiClient.fetchUuidForUsername(`${EXISTING_MC_NAME}_`)).resolves.toBeNull();

    expect(httpClient.get).toHaveBeenCalledWith(`https://crafthead.net/profile/${EXISTING_MC_NAME}_`);
  });

  test('Throws an exception on error response', async () => {
    httpClient.get.mockResolvedValue(new HttpResponse(400, new Map(), Buffer.from(JSON.stringify(THIRD_PARTY_RESPONSE_ERROR))));

    await expect(thirdPartyMinecraftApiClient.fetchUuidForUsername(EXISTING_MC_NAME))
      .rejects
      .toThrow(`Failed to get UUID for username '${EXISTING_MC_NAME}' from crafthead.net (Expected status 200 or 404): {status=400, body=${JSON.stringify(THIRD_PARTY_RESPONSE_ERROR)}}`);

    expect(httpClient.get).toHaveBeenCalledWith(`https://crafthead.net/profile/${EXISTING_MC_NAME}`);
  });

  test.each([204, 500])('Throws an exception on unexpected response status code of %j', async (statusCode: number) => {
    httpClient.get.mockResolvedValue(new HttpResponse(statusCode, new Map(), Buffer.from('some unexpected response')));

    await expect(thirdPartyMinecraftApiClient.fetchUuidForUsername(EXISTING_MC_NAME))
      .rejects
      .toThrow(`Failed to get UUID for username '${EXISTING_MC_NAME}' from crafthead.net (Expected status 200 or 404): {status=${statusCode}, body=some unexpected response}`);

    expect(httpClient.get)
      .toHaveBeenCalledWith(`https://crafthead.net/profile/${EXISTING_MC_NAME}`);
  });
});
