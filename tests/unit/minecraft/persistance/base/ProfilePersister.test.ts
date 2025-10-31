import { DeepMockProxy } from 'vitest-mock-extended';
import { vitest } from 'vitest';
import DatabaseClient from '../../../../../src/database/DatabaseClient.js';
import ProfilePersister from '../../../../../src/minecraft/persistance/base/ProfilePersister.js';
import { EXISTING_MC_ID, EXISTING_MC_NAME, EXISTING_MC_PROFILE_RESPONSE } from '../../../../test-constants.js';
import { createStrictDeepMock } from '../../../../test-helpers.js';

let databaseClient: DeepMockProxy<DatabaseClient>;
let profilePersister: ProfilePersister;

beforeEach(() => {
  databaseClient = createStrictDeepMock<DatabaseClient>({
    profile: {
      upsert: vitest.fn(),
      update: vitest.fn(),
    },
  });

  profilePersister = new ProfilePersister(databaseClient);
});

describe('#ProfilePersister', () => {
  test('#persist', async () => {
    await expect(profilePersister.persist(EXISTING_MC_PROFILE_RESPONSE)).resolves.toBeUndefined();

    expect(databaseClient.profile.upsert).toHaveBeenCalledTimes(1);
    expect(databaseClient.profile.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: EXISTING_MC_ID },
      create: {
        id: EXISTING_MC_ID,
        nameLowercase: EXISTING_MC_NAME.toLowerCase(),
        raw: EXISTING_MC_PROFILE_RESPONSE,
      },
      update: {
        nameLowercase: EXISTING_MC_NAME.toLowerCase(),
        raw: EXISTING_MC_PROFILE_RESPONSE,
        deleted: false,
      },
    }));

    expect(databaseClient.profile.update).toHaveBeenCalledTimes(0);
  });

  test('#persistProfileAsDeleted', async () => {
    await expect(profilePersister.persistProfileAsDeleted(EXISTING_MC_ID)).resolves.toBeUndefined();

    expect(databaseClient.profile.update).toHaveBeenCalledTimes(1);
    expect(databaseClient.profile.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: EXISTING_MC_ID },
      data: { deleted: true },
    }));

    expect(databaseClient.profile.upsert).toHaveBeenCalledTimes(0);
  });
});
