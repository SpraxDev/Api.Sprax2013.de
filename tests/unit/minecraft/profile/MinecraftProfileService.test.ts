import { jest } from '@jest/globals';
import { DeepMockProxy, mockDeep } from 'jest-mock-extended';
import LazyImportTaskCreator from '../../../../src/import_queue/LazyImportTaskCreator.js';
import MinecraftApiClient from '../../../../src/minecraft/MinecraftApiClient.js';
import MinecraftProfileCache from '../../../../src/minecraft/profile/MinecraftProfileCache.js';
import MinecraftProfileService, { Profile } from '../../../../src/minecraft/profile/MinecraftProfileService.js';
import SentrySdk from '../../../../src/SentrySdk.js';
import { EXISTING_MC_ID, EXISTING_MC_NAME, EXISTING_MC_PROFILE_RESPONSE } from '../../../test-constants.js';

let profileCache: DeepMockProxy<MinecraftProfileCache>;
let minecraftApiClient: DeepMockProxy<MinecraftApiClient>;
let lazyImportTaskCreator: DeepMockProxy<LazyImportTaskCreator>;
let minecraftProfileService: MinecraftProfileService;

beforeEach(() => {
  profileCache = mockDeep<MinecraftProfileCache>({
    fallbackMockImplementation: () => {
      throw new Error('Not implemented');
    }
  });
  minecraftApiClient = mockDeep<MinecraftApiClient>({
    fallbackMockImplementation: () => {
      throw new Error('Not implemented');
    }
  });
  lazyImportTaskCreator = mockDeep<LazyImportTaskCreator>({
    fallbackMockImplementation: () => {
      throw new Error('Not implemented');
    }
  });
  minecraftProfileService = new MinecraftProfileService(profileCache, minecraftApiClient, lazyImportTaskCreator);
});

describe('#provideProfileByUuid', () => {
  const nonExistingProfileUuid = '54118d28-84c4-11ef-b864-0242ac120002';

  test('Profile is resolved from cache', async () => {
    const expectedProfile = {
      profile: EXISTING_MC_PROFILE_RESPONSE,
      ageInSeconds: 0
    } satisfies Profile;

    profileCache.findByUuid.mockResolvedValue(expectedProfile);
    await expect(minecraftProfileService.provideProfileByUuid(EXISTING_MC_ID)).resolves.toEqual(expectedProfile);

    expect(profileCache.findByUuid).toHaveBeenCalledTimes(1);
    expect(profileCache.findByUuid).toHaveBeenCalledWith(EXISTING_MC_ID);

    expect(minecraftApiClient.fetchProfileForUuid).toHaveBeenCalledTimes(0);
    expect(minecraftApiClient.fetchUuidForUsername).toHaveBeenCalledTimes(0);
  });

  test('Null return values are cached and used on consecutive calls', async () => {
    profileCache.findByUuid.mockResolvedValue(null);
    minecraftApiClient.fetchProfileForUuid.mockResolvedValue(null);

    await expect(minecraftProfileService.provideProfileByUuid(nonExistingProfileUuid)).resolves.toBeNull();
    await expect(minecraftProfileService.provideProfileByUuid(nonExistingProfileUuid)).resolves.toBeNull();

    expect(profileCache.findByUuid).toHaveBeenCalledTimes(1);
    expect(profileCache.findByUuid).toHaveBeenCalledWith(nonExistingProfileUuid);

    expect(minecraftApiClient.fetchProfileForUuid).toHaveBeenCalledTimes(1);
    expect(minecraftApiClient.fetchProfileForUuid).toHaveBeenCalledWith(nonExistingProfileUuid);
  });

  test('Multiple profile requests at the same time are not processed individually', async () => {
    const expectedProfile = {
      profile: EXISTING_MC_PROFILE_RESPONSE,
      ageInSeconds: 0
    } satisfies Profile;

    profileCache.findByUuid.mockResolvedValue(null);
    profileCache.persist.mockResolvedValue(undefined);
    lazyImportTaskCreator.queueProfileUpdate.mockReturnValue(undefined);
    minecraftApiClient.fetchProfileForUuid.mockImplementation(() => {
      return new Promise((resolve) => {
        setImmediate(() => resolve(EXISTING_MC_PROFILE_RESPONSE));
      });
    });

    const promises: Promise<Profile | null>[] = [
      minecraftProfileService.provideProfileByUuid(EXISTING_MC_ID),
      minecraftProfileService.provideProfileByUuid(EXISTING_MC_ID),
      minecraftProfileService.provideProfileByUuid(EXISTING_MC_ID)
    ];

    await expect(promises[0]).resolves.toEqual(expectedProfile);
    await expect(promises[1]).resolves.toEqual(expectedProfile);
    await expect(promises[2]).resolves.toEqual(expectedProfile);

    expect(minecraftApiClient.fetchProfileForUuid).toHaveBeenCalledTimes(1);
    expect(minecraftApiClient.fetchProfileForUuid).toHaveBeenCalledWith(EXISTING_MC_ID);

    expect(profileCache.findByUuid).toHaveBeenCalledTimes(1);
    expect(profileCache.findByUuid).toHaveBeenCalledWith(EXISTING_MC_ID);

    expect(profileCache.persist).toHaveBeenCalledTimes(1);
    expect(profileCache.persist).toHaveBeenCalledWith(EXISTING_MC_PROFILE_RESPONSE);

    expect(lazyImportTaskCreator.queueProfileUpdate).toHaveBeenCalledTimes(1);
  });

  test('On Mojang API troubles, a recent but outdated cached profile is returned', async () => {
    const expectedProfile = {
      profile: EXISTING_MC_PROFILE_RESPONSE,
      ageInSeconds: 3 * 60
    } satisfies Profile;

    jest.spyOn(SentrySdk, 'captureError').mockReturnValue(undefined);

    profileCache.findByUuid.mockResolvedValue(expectedProfile);
    minecraftApiClient.fetchProfileForUuid.mockImplementation(() => {
      throw new Error('Connection timed out or something');
    });

    await expect(minecraftProfileService.provideProfileByUuid(EXISTING_MC_ID)).resolves.toEqual(expectedProfile);

    expect(profileCache.findByUuid).toHaveBeenCalledTimes(1);
    expect(profileCache.findByUuid).toHaveBeenCalledWith(EXISTING_MC_ID);

    expect(minecraftApiClient.fetchProfileForUuid).toHaveBeenCalledTimes(1);
    expect(minecraftApiClient.fetchUuidForUsername).toHaveBeenCalledTimes(0);

    expect(SentrySdk.captureError).toHaveBeenCalledTimes(1);
  });

  test('On Mojang API troubles, a very old cached profile is not returned', async () => {
    const expectedProfile = {
      profile: EXISTING_MC_PROFILE_RESPONSE,
      ageInSeconds: 25 * 60
    } satisfies Profile;

    profileCache.findByUuid.mockResolvedValue(expectedProfile);
    minecraftApiClient.fetchProfileForUuid.mockImplementation(() => {
      throw new Error('Connection timed out or something');
    });

    await expect(minecraftProfileService.provideProfileByUuid(EXISTING_MC_ID)).rejects.toThrow('Connection timed out or something');

    expect(profileCache.findByUuid).toHaveBeenCalledTimes(1);
    expect(profileCache.findByUuid).toHaveBeenCalledWith(EXISTING_MC_ID);

    expect(minecraftApiClient.fetchProfileForUuid).toHaveBeenCalledTimes(1);
    expect(minecraftApiClient.fetchUuidForUsername).toHaveBeenCalledTimes(0);
  });
});

describe('#provideProfileByUsername', () => {
  const nonExistingUsername = 'nonExistingUsername';

  test('Null return values are cached and used on consecutive calls', async () => {
    profileCache.findByUsername.mockResolvedValue(null);
    minecraftApiClient.fetchUuidForUsername.mockResolvedValue(null);

    await expect(minecraftProfileService.provideProfileByUsername(nonExistingUsername)).resolves.toBeNull();
    await expect(minecraftProfileService.provideProfileByUsername(nonExistingUsername)).resolves.toBeNull();

    expect(profileCache.findByUsername).toHaveBeenCalledTimes(1);
    expect(profileCache.findByUsername).toHaveBeenCalledWith(nonExistingUsername);

    expect(minecraftApiClient.fetchUuidForUsername).toHaveBeenCalledTimes(1);
    expect(minecraftApiClient.fetchUuidForUsername).toHaveBeenCalledWith(nonExistingUsername);
  });

  test('Multiple requests at the same time are not processed individually', async () => {
    const expectedProfile = {
      profile: EXISTING_MC_PROFILE_RESPONSE,
      ageInSeconds: 0
    } satisfies Profile;

    profileCache.findByUsername.mockResolvedValue(null);
    profileCache.findByUuid.mockResolvedValue(null);
    profileCache.persist.mockResolvedValue(undefined);
    lazyImportTaskCreator.queueProfileUpdate.mockReturnValue(undefined);
    minecraftApiClient.fetchUuidForUsername.mockImplementation(() => {
      return new Promise((resolve) => {
        setImmediate(() => resolve({ id: EXISTING_MC_ID, name: EXISTING_MC_NAME }));
      });
    });
    minecraftApiClient.fetchProfileForUuid.mockResolvedValue(EXISTING_MC_PROFILE_RESPONSE);

    const promises: Promise<Profile | null>[] = [
      minecraftProfileService.provideProfileByUsername(EXISTING_MC_NAME),
      minecraftProfileService.provideProfileByUsername(EXISTING_MC_NAME),
      minecraftProfileService.provideProfileByUsername(EXISTING_MC_NAME)
    ];

    await expect(promises[0]).resolves.toEqual(expectedProfile);
    await expect(promises[1]).resolves.toEqual(expectedProfile);
    await expect(promises[2]).resolves.toEqual(expectedProfile);

    expect(minecraftApiClient.fetchUuidForUsername).toHaveBeenCalledTimes(1);
    expect(minecraftApiClient.fetchUuidForUsername).toHaveBeenCalledWith(EXISTING_MC_NAME);

    expect(minecraftApiClient.fetchProfileForUuid).toHaveBeenCalledTimes(1);
    expect(minecraftApiClient.fetchProfileForUuid).toHaveBeenCalledWith(EXISTING_MC_ID);

    expect(profileCache.findByUsername).toHaveBeenCalledTimes(1);
    expect(profileCache.findByUsername).toHaveBeenCalledWith(EXISTING_MC_NAME);

    expect(profileCache.findByUuid).toHaveBeenCalledTimes(1);
    expect(profileCache.findByUuid).toHaveBeenCalledWith(EXISTING_MC_ID);

    expect(profileCache.persist).toHaveBeenCalledTimes(1);
    expect(profileCache.persist).toHaveBeenCalledWith(EXISTING_MC_PROFILE_RESPONSE);

    expect(lazyImportTaskCreator.queueProfileUpdate).toHaveBeenCalledTimes(1);
  });

  test('Return a cached profile if it is very recent', async () => {
    const expectedProfile = {
      profile: EXISTING_MC_PROFILE_RESPONSE,
      ageInSeconds: 60
    } satisfies Profile;

    profileCache.findByUsername.mockResolvedValue(expectedProfile);
    await expect(minecraftProfileService.provideProfileByUsername(EXISTING_MC_NAME)).resolves.toEqual(expectedProfile);

    expect(profileCache.findByUsername).toHaveBeenCalledTimes(1);
    expect(profileCache.findByUsername).toHaveBeenCalledWith(EXISTING_MC_NAME);
  });

  test('On Mojang API troubles (cached uuid->profile), a very old cached profile is not returned', async () => {
    const expectedProfile = {
      profile: EXISTING_MC_PROFILE_RESPONSE,
      ageInSeconds: 25 * 60
    } satisfies Profile;

    profileCache.findByUsername.mockResolvedValue(expectedProfile);
    profileCache.findByUuid.mockResolvedValue(expectedProfile);
    minecraftApiClient.fetchProfileForUuid.mockImplementation(() => {
      throw new Error('Connection timed out or something');
    });

    await expect(minecraftProfileService.provideProfileByUsername(EXISTING_MC_NAME)).rejects.toThrow('Connection timed out or something');

    expect(profileCache.findByUsername).toHaveBeenCalledTimes(1);
    expect(profileCache.findByUsername).toHaveBeenCalledWith(EXISTING_MC_NAME);

    expect(profileCache.findByUuid).toHaveBeenCalledTimes(1);
    expect(profileCache.findByUuid).toHaveBeenCalledWith(EXISTING_MC_ID);

    expect(minecraftApiClient.fetchProfileForUuid).toHaveBeenCalledTimes(1);
    expect(minecraftApiClient.fetchUuidForUsername).toHaveBeenCalledTimes(0);
  });

  test('On Mojang API troubles (username->profile) an error is thrown', async () => {
    profileCache.findByUsername.mockResolvedValue(null);
    minecraftApiClient.fetchUuidForUsername.mockImplementation(() => {
      throw new Error('Connection timed out or something');
    });

    await expect(minecraftProfileService.provideProfileByUsername(EXISTING_MC_NAME)).rejects.toThrow('Connection timed out or something');

    expect(profileCache.findByUsername).toHaveBeenCalledTimes(1);
    expect(profileCache.findByUsername).toHaveBeenCalledWith(EXISTING_MC_NAME);

    expect(minecraftApiClient.fetchUuidForUsername).toHaveBeenCalledTimes(1);
  });

  test('On Mojang API troubles (username->uuid), a recent but outdated cached profile is returned', async () => {
    const expectedProfile = {
      profile: EXISTING_MC_PROFILE_RESPONSE,
      ageInSeconds: 8 * 60
    } satisfies Profile;

    jest.spyOn(SentrySdk, 'captureError').mockReturnValue(undefined);
    profileCache.findByUsername.mockResolvedValue(expectedProfile);
    profileCache.findByUuid.mockResolvedValue(expectedProfile);
    minecraftApiClient.fetchUuidForUsername.mockImplementation(() => {
      throw new Error('Connection timed out or something');
    });
    minecraftApiClient.fetchProfileForUuid.mockResolvedValue(null);

    await expect(minecraftProfileService.provideProfileByUsername(EXISTING_MC_NAME)).resolves.toEqual(expectedProfile);

    expect(minecraftApiClient.fetchUuidForUsername).toHaveBeenCalledTimes(1);
    expect(minecraftApiClient.fetchUuidForUsername).toHaveBeenCalledWith(EXISTING_MC_NAME);

    expect(minecraftApiClient.fetchProfileForUuid).toHaveBeenCalledTimes(1);
    expect(minecraftApiClient.fetchProfileForUuid).toHaveBeenCalledWith(EXISTING_MC_ID);

    expect(profileCache.findByUsername).toHaveBeenCalledTimes(1);
    expect(profileCache.findByUsername).toHaveBeenCalledWith(EXISTING_MC_NAME);

    expect(profileCache.findByUuid).toHaveBeenCalledTimes(1);
    expect(profileCache.findByUuid).toHaveBeenCalledWith(EXISTING_MC_ID);

    expect(SentrySdk.captureError).toHaveBeenCalledTimes(1);
  });

  test('On Mojang API troubles (cached uuid->profile), a recent but outdated cached profile is returned', async () => {
    const expectedProfile = {
      profile: EXISTING_MC_PROFILE_RESPONSE,
      ageInSeconds: 8 * 60
    } satisfies Profile;

    jest.spyOn(SentrySdk, 'captureError').mockReturnValue(undefined);
    profileCache.findByUsername.mockResolvedValue(expectedProfile);
    profileCache.findByUuid.mockResolvedValue(expectedProfile);
    minecraftApiClient.fetchProfileForUuid.mockImplementation(() => {
      throw new Error('Connection timed out or something');
    });

    await expect(minecraftProfileService.provideProfileByUsername(EXISTING_MC_NAME)).resolves.toEqual(expectedProfile);

    expect(minecraftApiClient.fetchProfileForUuid).toHaveBeenCalledTimes(1);
    expect(minecraftApiClient.fetchProfileForUuid).toHaveBeenCalledWith(EXISTING_MC_ID);

    expect(profileCache.findByUsername).toHaveBeenCalledTimes(1);
    expect(profileCache.findByUsername).toHaveBeenCalledWith(EXISTING_MC_NAME);

    expect(profileCache.findByUuid).toHaveBeenCalledTimes(1);
    expect(profileCache.findByUuid).toHaveBeenCalledWith(EXISTING_MC_ID);

    expect(SentrySdk.captureError).toHaveBeenCalledTimes(1);
  });

  test('If the cached username profile is not recent, try refreshing it and return on identical name', async () => {
    const cachedProfile = {
      profile: EXISTING_MC_PROFILE_RESPONSE,
      ageInSeconds: 61
    } satisfies Profile;

    profileCache.findByUsername.mockResolvedValue(cachedProfile);
    profileCache.findByUuid.mockResolvedValue(cachedProfile);
    profileCache.persist.mockResolvedValue(undefined);
    lazyImportTaskCreator.queueProfileUpdate.mockReturnValue(undefined);
    minecraftApiClient.fetchProfileForUuid.mockResolvedValue(EXISTING_MC_PROFILE_RESPONSE);

    await expect(minecraftProfileService.provideProfileByUsername(EXISTING_MC_NAME))
      .resolves
      .toEqual({
        profile: EXISTING_MC_PROFILE_RESPONSE,
        ageInSeconds: 0
      });

    expect(minecraftApiClient.fetchProfileForUuid).toHaveBeenCalledTimes(1);
    expect(minecraftApiClient.fetchProfileForUuid).toHaveBeenCalledWith(EXISTING_MC_ID);

    expect(profileCache.findByUsername).toHaveBeenCalledTimes(1);
    expect(profileCache.findByUsername).toHaveBeenCalledWith(EXISTING_MC_NAME);

    expect(profileCache.findByUuid).toHaveBeenCalledTimes(1);
    expect(profileCache.findByUuid).toHaveBeenCalledWith(EXISTING_MC_ID);

    expect(profileCache.persist).toHaveBeenCalledTimes(1);
    expect(profileCache.persist).toHaveBeenCalledWith(EXISTING_MC_PROFILE_RESPONSE);

    expect(lazyImportTaskCreator.queueProfileUpdate).toHaveBeenCalledTimes(1);
  });

  test('If the cached username profile is not recent, try refreshing it but resolve UUID if not the same name', async () => {
    const outdatedCachedProfileForUsernameThatNowBelongsToAnotherUuid = {
      profile: { ...EXISTING_MC_PROFILE_RESPONSE, id: 'some-other-user' },
      ageInSeconds: 90
    } satisfies Profile;

    profileCache.findByUsername.mockResolvedValue(outdatedCachedProfileForUsernameThatNowBelongsToAnotherUuid);
    profileCache.findByUuid
      .mockResolvedValue(null)
      .mockResolvedValueOnce(outdatedCachedProfileForUsernameThatNowBelongsToAnotherUuid);
    profileCache.persist.mockResolvedValue(undefined);
    lazyImportTaskCreator.queueProfileUpdate.mockReturnValue(undefined);
    minecraftApiClient.fetchUuidForUsername.mockResolvedValue({ id: EXISTING_MC_ID, name: EXISTING_MC_NAME });
    minecraftApiClient.fetchProfileForUuid
      .mockResolvedValueOnce({ ...EXISTING_MC_PROFILE_RESPONSE, id: 'some-other-user', name: 'new_username' })
      .mockResolvedValueOnce(EXISTING_MC_PROFILE_RESPONSE);

    await expect(minecraftProfileService.provideProfileByUsername(EXISTING_MC_NAME))
      .resolves
      .toEqual({
        profile: EXISTING_MC_PROFILE_RESPONSE,
        ageInSeconds: 0
      });

    expect(minecraftApiClient.fetchUuidForUsername).toHaveBeenCalledTimes(1);
    expect(minecraftApiClient.fetchUuidForUsername).toHaveBeenCalledWith(EXISTING_MC_NAME);

    expect(minecraftApiClient.fetchProfileForUuid).toHaveBeenCalledTimes(2);
    expect(minecraftApiClient.fetchProfileForUuid).toHaveBeenNthCalledWith(1, 'some-other-user');
    expect(minecraftApiClient.fetchProfileForUuid).toHaveBeenNthCalledWith(2, EXISTING_MC_ID);

    expect(profileCache.findByUsername).toHaveBeenCalledTimes(1);
    expect(profileCache.findByUsername).toHaveBeenCalledWith(EXISTING_MC_NAME);

    expect(profileCache.findByUuid).toHaveBeenCalledTimes(2);
    expect(profileCache.findByUuid).toHaveBeenNthCalledWith(1, 'some-other-user');
    expect(profileCache.findByUuid).toHaveBeenNthCalledWith(2, EXISTING_MC_ID);

    expect(profileCache.persist).toHaveBeenCalledTimes(2);
    expect(profileCache.persist).toHaveBeenNthCalledWith(1, {
      ...EXISTING_MC_PROFILE_RESPONSE,
      id: 'some-other-user',
      name: 'new_username'
    });
    expect(profileCache.persist).toHaveBeenNthCalledWith(2, EXISTING_MC_PROFILE_RESPONSE);

    expect(lazyImportTaskCreator.queueProfileUpdate).toHaveBeenCalledTimes(2);
    expect(lazyImportTaskCreator.queueProfileUpdate).toHaveBeenNthCalledWith(1, {
      ...EXISTING_MC_PROFILE_RESPONSE,
      id: 'some-other-user',
      name: 'new_username'
    });
    expect(lazyImportTaskCreator.queueProfileUpdate).toHaveBeenNthCalledWith(2, EXISTING_MC_PROFILE_RESPONSE);
  });
});
