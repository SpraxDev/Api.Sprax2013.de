import { DeepMockProxy, mockDeep } from 'jest-mock-extended';
import DatabaseClient from '../../../../src/database/DatabaseClient.js';
import MinecraftProfileCache from '../../../../src/minecraft/profile/MinecraftProfileCache.js';
import { EXISTING_MC_ID, EXISTING_MC_NAME, EXISTING_MC_PROFILE_RESPONSE } from '../../../test-constants.js';

let databaseClient: DeepMockProxy<DatabaseClient>;
let minecraftProfileCache: MinecraftProfileCache;

beforeEach(() => {
  databaseClient = mockDeep<DatabaseClient>({
    fallbackMockImplementation: () => {
      throw new Error('Not implemented');
    }
  });
  minecraftProfileCache = new MinecraftProfileCache(databaseClient);
});

describe('#findByUuid', () => {
  test('return null if no profile is found', async () => {
    databaseClient.profileCache.findUnique.mockResolvedValue(null);
    await expect(minecraftProfileCache.findByUuid(EXISTING_MC_ID)).resolves.toBeNull();
  });

  test('returns a cached profile', async () => {
    const cachedProfile = {
      raw: EXISTING_MC_PROFILE_RESPONSE,
      ageInSeconds: 100 * 60
    };
    databaseClient.profileCache.findUnique.mockResolvedValue(cachedProfile as any);

    await expect(minecraftProfileCache.findByUuid(EXISTING_MC_ID))
      .resolves
      .toEqual({
        profile: EXISTING_MC_PROFILE_RESPONSE,
        ageInSeconds: 100 * 60
      });

    expect(databaseClient.profileCache.findUnique).toHaveBeenCalledTimes(1);
  });
});

describe('#findByUsername', () => {
  test('return null if no profile is found', async () => {
    databaseClient.profileCache.findFirst.mockResolvedValue(null);
    await expect(minecraftProfileCache.findByUsername(EXISTING_MC_NAME)).resolves.toBeNull();
  });

  test('returns a cached profile', async () => {
    const cachedProfile = {
      raw: EXISTING_MC_PROFILE_RESPONSE,
      ageInSeconds: 100 * 60
    };
    databaseClient.profileCache.findFirst.mockResolvedValue(cachedProfile as any);

    await expect(minecraftProfileCache.findByUsername(EXISTING_MC_NAME))
      .resolves
      .toEqual({
        profile: EXISTING_MC_PROFILE_RESPONSE,
        ageInSeconds: 100 * 60
      });

    expect(databaseClient.profileCache.findFirst).toHaveBeenCalledTimes(1);
  });
});

test('#persist', async () => {
  databaseClient.profile.upsert.mockResolvedValue(undefined as any);

  await expect(minecraftProfileCache.persist(EXISTING_MC_PROFILE_RESPONSE)).resolves.toBeUndefined();

  expect(databaseClient.profile.upsert).toHaveBeenCalledTimes(1);
});
