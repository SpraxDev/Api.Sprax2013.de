import { HttpResponse } from '@spraxdev/node-commons/http';
import { container } from 'tsyringe';
import { DeepMockProxy, mockDeep } from 'vitest-mock-extended';
import AutoProxiedHttpClient from '../../../src/http/clients/AutoProxiedHttpClient.js';
import type { UsernameToUuidResponse } from '../../../src/minecraft/MinecraftApiClient.js';
import MinecraftProfileService from '../../../src/minecraft/profile/MinecraftProfileService.js';
import ThirdPartyMinecraftApiClient from '../../../src/minecraft/ThirdPartyMinecraftApiClient.js';
import { EXISTING_MC_ID, EXISTING_MC_NAME, EXISTING_MC_PROFILE_RESPONSE } from '../../test-constants.js';

const THIRD_PARTY_RESPONSE_SUCCESS = {
  ok: true,
  status: 200,
  data: { id: EXISTING_MC_ID, name: EXISTING_MC_NAME },
  meta: { cached: false, fetched: 1757678121995, expires: 1757679021995, expiration: 900 },
};
const THIRD_PARTY_RESPONSE_NOT_FOUND = {
  ok: false,
  status: 404,
  data: {
    path: `/minecraft/profile/lookup/name/${EXISTING_MC_NAME}_`,
    errorMessage: `Couldn't find any profile with name ${EXISTING_MC_NAME}_`,
  },
  meta: { cached: false, fetched: 1757678121995, expires: 1757679021995, expiration: 900 },
};
const THIRD_PARTY_RESPONSE_ERROR = {
  ok: false,
  data: { error: 'Invalid name' },
  meta: { cached: false, fetched: 1757678121995, expires: 1757679021995, expiration: 1 },
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

    expect(httpClient.get).toHaveBeenCalledWith(`https://mcproxy.dev/uuid/${EXISTING_MC_NAME}`);
    expect(minecraftProfileService.provideProfileByUuid).toHaveBeenCalledTimes(1);
  });

  test.each([null, EXISTING_MC_PROFILE_RESPONSE])(`Throw when the UUID from the third-party API does not match the profile from the first-party API`, async () => {
    const thirdPartyApiResponse: typeof THIRD_PARTY_RESPONSE_SUCCESS = JSON.parse(JSON.stringify(THIRD_PARTY_RESPONSE_SUCCESS));
    thirdPartyApiResponse.data.name = 'a-different-name';

    httpClient.get.mockResolvedValue(new HttpResponse(200, new Map(), Buffer.from(JSON.stringify(thirdPartyApiResponse))));
    minecraftProfileService.provideProfileByUuid.mockResolvedValue({ profile: EXISTING_MC_PROFILE_RESPONSE, ageInSeconds: 0 });

    await expect(thirdPartyMinecraftApiClient.fetchUuidForUsername('a-different-name'))
      .rejects
      .toThrow(`Failed to get UUID for username 'a-different-name' from mcproxy.dev (Profile for returned uuid (${EXISTING_MC_ID}) does not match the requested username)`);

    expect(httpClient.get).toHaveBeenCalledWith(`https://mcproxy.dev/uuid/a-different-name`);
    expect(minecraftProfileService.provideProfileByUuid).toHaveBeenCalledTimes(1);
  });

  test(`Returns null when API response with 'Not Found' status in the body`, async () => {
    httpClient.get.mockResolvedValue(new HttpResponse(200, new Map(), Buffer.from(JSON.stringify(THIRD_PARTY_RESPONSE_NOT_FOUND))));

    await expect(thirdPartyMinecraftApiClient.fetchUuidForUsername(`${EXISTING_MC_NAME}_`)).resolves.toBeNull();

    expect(httpClient.get).toHaveBeenCalledWith(`https://mcproxy.dev/uuid/${EXISTING_MC_NAME}_`);
  });

  test('Throws an exception on error response', async () => {
    httpClient.get.mockResolvedValue(new HttpResponse(400, new Map(), Buffer.from(JSON.stringify(THIRD_PARTY_RESPONSE_ERROR))));

    await expect(thirdPartyMinecraftApiClient.fetchUuidForUsername(EXISTING_MC_NAME))
      .rejects
      .toThrow(`Failed to get UUID for username '${EXISTING_MC_NAME}' from mcproxy.dev (Expected status 200): {status=400, body=${JSON.stringify(THIRD_PARTY_RESPONSE_ERROR)}}`);

    expect(httpClient.get).toHaveBeenCalledWith(`https://mcproxy.dev/uuid/${EXISTING_MC_NAME}`);
  });

  test.each([204, 404, 500])('Throws an exception on unexpected response status code of %j', async (statusCode: number) => {
    httpClient.get.mockResolvedValue(new HttpResponse(statusCode, new Map(), Buffer.from('some unexpected response')));

    await expect(thirdPartyMinecraftApiClient.fetchUuidForUsername(EXISTING_MC_NAME))
      .rejects
      .toThrow(`Failed to get UUID for username '${EXISTING_MC_NAME}' from mcproxy.dev (Expected status 200): {status=${statusCode}, body=some unexpected response}`);

    expect(httpClient.get)
      .toHaveBeenCalledWith(`https://mcproxy.dev/uuid/${EXISTING_MC_NAME}`);
  });
});
