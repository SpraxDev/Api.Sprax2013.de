import { jest } from '@jest/globals';
import * as PrismaClient from '@prisma/client';
import { DeepMockProxy } from 'jest-mock-extended';
import DatabaseClient from '../../../../../src/database/DatabaseClient.js';
import ProfileSeenSkinPersister from '../../../../../src/minecraft/persistance/base/ProfileSeenSkinPersister.js';
import { EXISTING_MC_ID } from '../../../../test-constants.js';
import { createStrictDeepMock } from '../../../../test-helpers.js';

let databaseClient: DeepMockProxy<DatabaseClient>;
let databaseTransaction: DeepMockProxy<PrismaClient.PrismaClient>;
let profileSeenSkinPersister: ProfileSeenSkinPersister;

beforeEach(() => {
  databaseTransaction = createStrictDeepMock<PrismaClient.PrismaClient>({
    profileSeenSkin: {
      upsert: jest.fn<any>().mockResolvedValue(undefined)
    }
  });
  databaseClient = createStrictDeepMock<DatabaseClient>({
    $transaction: jest.fn<any>().mockImplementation((fn: any) => fn(databaseTransaction))
  });

  profileSeenSkinPersister = new ProfileSeenSkinPersister(databaseClient);
});

describe('#persist', () => {
  const lastMonth = new Date('2024-04-14');
  const lastWeek = new Date('2024-05-07');
  const today = new Date('2024-05-14');

  test('Does nothing, when provided timestamp does not change the already persisted data', async () => {
    databaseTransaction.profileSeenSkin.findUnique.mockResolvedValue({
      firstSeenUsing: lastWeek,
      lastSeenUsing: today
    } satisfies Partial<PrismaClient.ProfileSeenSkin> as any);

    await expect(profileSeenSkinPersister.persist(EXISTING_MC_ID, 123n, today)).resolves.toBeUndefined();

    expect(databaseClient.$transaction).toHaveBeenCalledTimes(1);
    expectFindUniqueCalled();

    expect(databaseTransaction.profileSeenSkin.upsert).toHaveBeenCalledTimes(0);
  });

  test('Persisting a never-seen skin', async () => {
    databaseTransaction.profileSeenSkin.findUnique.mockResolvedValue(null);

    await expect(profileSeenSkinPersister.persist(EXISTING_MC_ID, 123n, today)).resolves.toBeUndefined();

    expect(databaseClient.$transaction).toHaveBeenCalledTimes(1);
    expectFindUniqueCalled();

    expect(databaseTransaction.profileSeenSkin.upsert).toHaveBeenCalledTimes(1);
    expect(databaseTransaction.profileSeenSkin.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { profileId_skinId: { profileId: EXISTING_MC_ID, skinId: 123n } },
      create: {
        profileId: EXISTING_MC_ID,
        skinId: 123n,
        firstSeenUsing: today,
        lastSeenUsing: today
      },
      update: {
        firstSeenUsing: today,
        lastSeenUsing: today
      }
    } satisfies PrismaClient.Prisma.ProfileSeenSkinUpsertArgs));
  });

  test('Updating a skin seen last week to seen today', async () => {
    databaseTransaction.profileSeenSkin.findUnique.mockResolvedValue({
      firstSeenUsing: lastWeek,
      lastSeenUsing: lastWeek
    } satisfies Partial<PrismaClient.ProfileSeenSkin> as any);

    await expect(profileSeenSkinPersister.persist(EXISTING_MC_ID, 123n, today)).resolves.toBeUndefined();

    expect(databaseClient.$transaction).toHaveBeenCalledTimes(1);
    expectFindUniqueCalled();

    expect(databaseTransaction.profileSeenSkin.upsert).toHaveBeenCalledTimes(1);
    expect(databaseTransaction.profileSeenSkin.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { profileId_skinId: { profileId: EXISTING_MC_ID, skinId: 123n } },
      create: {
        profileId: EXISTING_MC_ID,
        skinId: 123n,
        firstSeenUsing: today,
        lastSeenUsing: today
      },
      update: {
        firstSeenUsing: undefined,
        lastSeenUsing: today
      }
    } satisfies PrismaClient.Prisma.ProfileSeenSkinUpsertArgs));
  });

  test('Updating a skin seen last week to first seen last month', async () => {
    databaseTransaction.profileSeenSkin.findUnique.mockResolvedValue({
      firstSeenUsing: lastWeek,
      lastSeenUsing: lastWeek
    } satisfies Partial<PrismaClient.ProfileSeenSkin> as any);

    await expect(profileSeenSkinPersister.persist(EXISTING_MC_ID, 123n, lastMonth)).resolves.toBeUndefined();

    expect(databaseClient.$transaction).toHaveBeenCalledTimes(1);
    expectFindUniqueCalled();

    expect(databaseTransaction.profileSeenSkin.upsert).toHaveBeenCalledTimes(1);
    expect(databaseTransaction.profileSeenSkin.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { profileId_skinId: { profileId: EXISTING_MC_ID, skinId: 123n } },
      create: {
        profileId: EXISTING_MC_ID,
        skinId: 123n,
        firstSeenUsing: lastMonth,
        lastSeenUsing: lastMonth
      },
      update: {
        firstSeenUsing: lastMonth,
        lastSeenUsing: undefined
      }
    } satisfies PrismaClient.Prisma.ProfileSeenSkinUpsertArgs));
  });
});

function expectFindUniqueCalled(): void {
  expect(databaseTransaction.profileSeenSkin.findUnique).toHaveBeenCalledTimes(1);
  expect(databaseTransaction.profileSeenSkin.findUnique).toHaveBeenCalledWith(expect.objectContaining({
    where: { profileId_skinId: { profileId: EXISTING_MC_ID, skinId: 123n } }
  } satisfies PrismaClient.Prisma.ProfileSeenSkinFindUniqueArgs));
}
