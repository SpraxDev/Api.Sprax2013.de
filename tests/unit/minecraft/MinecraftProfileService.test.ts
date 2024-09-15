import { jest } from '@jest/globals';
import { DeepMockProxy, mockDeep } from 'jest-mock-extended';
import DatabaseClient from '../../../src/database/DatabaseClient.js';
import MinecraftApiClient, { UuidToProfileResponse } from '../../../src/minecraft/MinecraftApiClient.js';
import MinecraftProfileService from '../../../src/minecraft/MinecraftProfileService.js';
import SentrySdk from '../../../src/SentrySdk.js';
import { EXISTING_MC_ID, EXISTING_MC_NAME, EXISTING_MC_PROFILE_RESPONSE } from '../../test-constants.js';

jest.useFakeTimers();
jest.setSystemTime(new Date('2024-01-01'));

let minecraftApiClient: DeepMockProxy<MinecraftApiClient>;
let databaseClient: DeepMockProxy<DatabaseClient>;
let minecraftProfileService: MinecraftProfileService;

beforeEach(() => {
  minecraftApiClient = mockDeep<MinecraftApiClient>({
    fetchUuidForUsername: jest.fn(async (username) => {
      return username === EXISTING_MC_NAME ? { id: EXISTING_MC_ID, name: EXISTING_MC_NAME } : null;
    }),
    fetchProfileForUuid: jest.fn(async (uuid: string) => {
      return uuid === EXISTING_MC_ID ? EXISTING_MC_PROFILE_RESPONSE : null;
    }),
    fetchListOfBlockedServers: async () => {
      throw new Error('Mock not implemented');
    }
  });
  databaseClient = mockDeep<DatabaseClient>({
    fallbackMockImplementation: () => {
      throw new Error('Mock not implemented');
    }
  });
  minecraftProfileService = new MinecraftProfileService(minecraftApiClient, databaseClient);

  databaseClient.profile.upsert.mockResolvedValue(undefined as any);
});

describe('#provideProfileByUuid', () => {
  test('Requesting a UUID without profile, returns null', async () => {
    databaseClient.profileCache.findUnique.mockResolvedValue(null);

    await expect(minecraftProfileService.provideProfileByUuid('invalid-uuid')).resolves.toBeNull();
    expect(databaseClient.profile.upsert).toHaveBeenCalledTimes(0);
  });

  test('Requesting the same unknown UUID twice, returns null from cache', async () => {
    databaseClient.profileCache.findUnique.mockResolvedValue(null);

    await expect(minecraftProfileService.provideProfileByUuid('invalid-uuid')).resolves.toBeNull();
    jest.advanceTimersByTime(30_000);
    await expect(minecraftProfileService.provideProfileByUuid('invalid-UUID')).resolves.toBeNull();

    expect(minecraftApiClient.fetchProfileForUuid).toHaveBeenCalledTimes(1);
    expect(databaseClient.profileCache.findUnique).toHaveBeenCalledTimes(1);
    expect(databaseClient.profileCache.findUnique).toHaveBeenCalledWith({
      select: expect.anything(),
      where: { id: 'invalid-uuid' }
    });
  });

  test('Requesting a UUID that is stored in the database', async () => {
    databaseClient.profileCache.findUnique.mockResolvedValue({
      raw: EXISTING_MC_PROFILE_RESPONSE satisfies UuidToProfileResponse,
      ageInSeconds: 10
    } as any);

    await expect(minecraftProfileService.provideProfileByUuid(EXISTING_MC_ID)).resolves.toEqual({
      profile: EXISTING_MC_PROFILE_RESPONSE satisfies UuidToProfileResponse,
      ageInSeconds: 10
    });
    expect(databaseClient.profile.upsert).toHaveBeenCalledTimes(0);
    expect(minecraftApiClient.fetchProfileForUuid).toHaveBeenCalledTimes(0);
  });

  test('Requesting a UUID that is stored in the database but has expired', async () => {
    databaseClient.profileCache.findUnique.mockResolvedValue({
      raw: {
        ...EXISTING_MC_PROFILE_RESPONSE,
        name: 'old-name'
      } satisfies UuidToProfileResponse,
      ageInSeconds: 120
    } as any);

    await expect(minecraftProfileService.provideProfileByUuid(EXISTING_MC_ID)).resolves.toEqual({
      profile: EXISTING_MC_PROFILE_RESPONSE,
      ageInSeconds: 0
    });
    expect(minecraftApiClient.fetchProfileForUuid).toHaveBeenCalledTimes(1);

    expect(databaseClient.profile.upsert).toHaveBeenCalledTimes(1);
    expect(databaseClient.profile.upsert).toHaveBeenCalledWith({
      where: { id: EXISTING_MC_ID },
      create: {
        id: EXISTING_MC_ID,
        nameLowercase: EXISTING_MC_NAME.toLowerCase(),
        raw: EXISTING_MC_PROFILE_RESPONSE
      },
      update: {
        nameLowercase: EXISTING_MC_NAME.toLowerCase(),
        raw: EXISTING_MC_PROFILE_RESPONSE,
        deleted: false
      }
    });
  });

  test('Requesting a UUID that is stored in the database but has recently expired, but the API is not available', async () => {
    jest.spyOn(SentrySdk, 'captureError').mockReturnValue(undefined);

    minecraftApiClient.fetchProfileForUuid.mockRejectedValue(new Error('Internal Server Error'));
    databaseClient.profileCache.findUnique.mockResolvedValue({
      raw: {
        ...EXISTING_MC_PROFILE_RESPONSE,
        name: 'old-name'
      } satisfies UuidToProfileResponse,
      ageInSeconds: 120
    } as any);

    await expect(minecraftProfileService.provideProfileByUuid(EXISTING_MC_ID)).resolves.toEqual({
      profile: {
        ...EXISTING_MC_PROFILE_RESPONSE,
        name: 'old-name'
      },
      ageInSeconds: 120
    });
    expect(minecraftApiClient.fetchProfileForUuid).toHaveBeenCalledTimes(1);
    expect(databaseClient.profile.upsert).toHaveBeenCalledTimes(0);

    expect(SentrySdk.captureError).toHaveBeenCalledTimes(1);
  });

  test('Requesting a UUID that is stored in the database but is very old, but the API is not available', async () => {
    jest.spyOn(SentrySdk, 'captureError').mockReturnValue(undefined);

    minecraftApiClient.fetchProfileForUuid.mockRejectedValue(new Error('Internal Server Error'));
    databaseClient.profileCache.findUnique.mockResolvedValue({
      raw: {
        ...EXISTING_MC_PROFILE_RESPONSE,
        name: 'old-name'
      } satisfies UuidToProfileResponse,
      ageInSeconds: 20 * 60
    } as any);

    await expect(minecraftProfileService.provideProfileByUuid(EXISTING_MC_ID)).rejects.toThrow('Internal Server Error');
    expect(minecraftApiClient.fetchProfileForUuid).toHaveBeenCalledTimes(1);
    expect(databaseClient.profile.upsert).toHaveBeenCalledTimes(0);

    expect(SentrySdk.captureError).toHaveBeenCalledTimes(0);
  });
});

describe('#provideProfileByUsername', () => {
  test('Requesting a username without profile, returns null', async () => {
    databaseClient.profileCache.findFirst.mockResolvedValue(null);

    await expect(minecraftProfileService.provideProfileByUsername('invalid-name')).resolves.toBeNull();
    expect(databaseClient.profile.upsert).toHaveBeenCalledTimes(0);
    expect(databaseClient.profileCache.findFirst).toHaveBeenCalledTimes(1);
    expect(databaseClient.profileCache.findFirst).toHaveBeenCalledWith({
      select: expect.anything(),
      where: {
        nameLowercase: 'invalid-name'
      },
      orderBy: {
        ageInSeconds: 'asc'
      }
    });
  });

  test('Requesting the same username without profile twice, returns null from cache', async () => {
    databaseClient.profileCache.findFirst.mockResolvedValue(null);

    await expect(minecraftProfileService.provideProfileByUsername('invalid-name')).resolves.toBeNull();
    jest.advanceTimersByTime(30_000);
    await expect(minecraftProfileService.provideProfileByUsername('invalid-NAME')).resolves.toBeNull();

    expect(minecraftApiClient.fetchUuidForUsername).toHaveBeenCalledTimes(1);
    expect(databaseClient.profileCache.findFirst).toHaveBeenCalledTimes(1);
    expect(databaseClient.profileCache.findFirst).toHaveBeenCalledWith({
      select: expect.anything(),
      where: {
        nameLowercase: 'invalid-name'
      },
      orderBy: {
        ageInSeconds: 'asc'
      }
    });
  });

  test('Requesting a valid username that is stored in the database', async () => {
    databaseClient.profileCache.findFirst.mockResolvedValue({
      raw: EXISTING_MC_PROFILE_RESPONSE satisfies UuidToProfileResponse,
      ageInSeconds: 10
    } as any);

    await expect(minecraftProfileService.provideProfileByUsername(EXISTING_MC_NAME)).resolves.toEqual({
      profile: EXISTING_MC_PROFILE_RESPONSE satisfies UuidToProfileResponse,
      ageInSeconds: 10
    });
    expect(databaseClient.profile.upsert).toHaveBeenCalledTimes(0);
    expect(minecraftApiClient.fetchUuidForUsername).toHaveBeenCalledTimes(0);
    expect(minecraftApiClient.fetchProfileForUuid).toHaveBeenCalledTimes(0);
  });

  test('Requesting a valid username that is stored in the database but has expired', async () => {
    databaseClient.profileCache.findFirst.mockResolvedValue({
      raw: {
        ...EXISTING_MC_PROFILE_RESPONSE,
        profileActions: ['test-action']
      } satisfies UuidToProfileResponse,
      ageInSeconds: 120
    } as any);
    databaseClient.profileCache.findUnique.mockResolvedValue({
      raw: {
        ...EXISTING_MC_PROFILE_RESPONSE,
        profileActions: ['test-action']
      } satisfies UuidToProfileResponse,
      ageInSeconds: 120
    } as any);

    await expect(minecraftProfileService.provideProfileByUsername(EXISTING_MC_NAME)).resolves.toEqual({
      profile: EXISTING_MC_PROFILE_RESPONSE,
      ageInSeconds: 0
    });
    expect(minecraftApiClient.fetchUuidForUsername).toHaveBeenCalledTimes(1);
    expect(minecraftApiClient.fetchProfileForUuid).toHaveBeenCalledTimes(1);

    expect(databaseClient.profile.upsert).toHaveBeenCalledTimes(1);
    expect(databaseClient.profile.upsert).toHaveBeenCalledWith({
      where: { id: EXISTING_MC_ID },
      create: {
        id: EXISTING_MC_ID,
        nameLowercase: EXISTING_MC_NAME.toLowerCase(),
        raw: EXISTING_MC_PROFILE_RESPONSE
      },
      update: {
        nameLowercase: EXISTING_MC_NAME.toLowerCase(),
        raw: EXISTING_MC_PROFILE_RESPONSE,
        deleted: false
      }
    });
  });

  test('Requesting a valid username that is stored in the database but has recently expired, but the API is not available', async () => {
    jest.spyOn(SentrySdk, 'captureError').mockReturnValue(undefined);

    minecraftApiClient.fetchUuidForUsername.mockRejectedValue(new Error('Internal Server Error'));
    databaseClient.profileCache.findFirst.mockResolvedValue({
      raw: {
        ...EXISTING_MC_PROFILE_RESPONSE,
        profileActions: ['test-action']
      } satisfies UuidToProfileResponse,
      ageInSeconds: 120
    } as any);

    await expect(minecraftProfileService.provideProfileByUsername(EXISTING_MC_NAME)).resolves.toEqual({
      profile: {
        ...EXISTING_MC_PROFILE_RESPONSE,
        profileActions: ['test-action']
      },
      ageInSeconds: 120
    });
    expect(minecraftApiClient.fetchUuidForUsername).toHaveBeenCalledTimes(1);
    expect(minecraftApiClient.fetchProfileForUuid).toHaveBeenCalledTimes(0);
    expect(databaseClient.profile.upsert).toHaveBeenCalledTimes(0);

    expect(SentrySdk.captureError).toHaveBeenCalledTimes(1);
  });

  test('Requesting a valid username that is stored in the database but is very old, but the API is not available', async () => {
    jest.spyOn(SentrySdk, 'captureError').mockReturnValue(undefined);

    minecraftApiClient.fetchUuidForUsername.mockRejectedValue(new Error('Internal Server Error'));
    databaseClient.profileCache.findFirst.mockResolvedValue({
      raw: {
        ...EXISTING_MC_PROFILE_RESPONSE,
        profileActions: ['test-action']
      } satisfies UuidToProfileResponse,
      ageInSeconds: 20 * 60
    } as any);

    await expect(minecraftProfileService.provideProfileByUsername(EXISTING_MC_NAME)).rejects.toThrow('Internal Server Error');
    expect(minecraftApiClient.fetchUuidForUsername).toHaveBeenCalledTimes(1);
    expect(minecraftApiClient.fetchProfileForUuid).toHaveBeenCalledTimes(0);
    expect(databaseClient.profile.upsert).toHaveBeenCalledTimes(0);

    expect(SentrySdk.captureError).toHaveBeenCalledTimes(0);
  });
});
