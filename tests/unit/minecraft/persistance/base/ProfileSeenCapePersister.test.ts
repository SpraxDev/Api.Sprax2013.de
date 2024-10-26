import { jest } from '@jest/globals';
import * as PrismaClient from '@prisma/client';
import { DeepMockProxy } from 'jest-mock-extended';
import DatabaseClient from '../../../../../src/database/DatabaseClient.js';
import ProfileSeenCapePersister from '../../../../../src/minecraft/persistance/base/ProfileSeenCapePersister.js';
import { EXISTING_MC_ID } from '../../../../test-constants.js';
import { createStrictDeepMock } from '../../../../test-helpers.js';

let databaseClient: DeepMockProxy<DatabaseClient>;
let databaseTransaction: DeepMockProxy<PrismaClient.PrismaClient>;
let profileSeenCapePersister: ProfileSeenCapePersister;

beforeEach(() => {
  databaseTransaction = createStrictDeepMock<PrismaClient.PrismaClient>({
    profileSeenCape: {
      upsert: jest.fn<any>().mockResolvedValue(undefined)
    }
  });
  databaseClient = createStrictDeepMock<DatabaseClient>({
    $transaction: jest.fn<any>().mockImplementation((fn: any) => fn(databaseTransaction))
  });

  profileSeenCapePersister = new ProfileSeenCapePersister(databaseClient);
});

describe('#persist', () => {
  const lastMonth = new Date('2024-04-14');
  const lastWeek = new Date('2024-05-07');
  const today = new Date('2024-05-14');

  test('Does nothing, when provided timestamp does not change the already persisted data', async () => {
    databaseTransaction.profileSeenCape.findUnique.mockResolvedValue({
      firstSeenUsing: lastWeek,
      lastSeenUsing: today
    } satisfies Partial<PrismaClient.ProfileSeenCape> as any);

    await expect(profileSeenCapePersister.persist(EXISTING_MC_ID, 123n, today)).resolves.toBeUndefined();

    expect(databaseClient.$transaction).toHaveBeenCalledTimes(1);
    expectFindUniqueCalled();

    expect(databaseTransaction.profileSeenCape.upsert).toHaveBeenCalledTimes(0);
  });

  test('Persisting a never-seen cape', async () => {
    databaseTransaction.profileSeenCape.findUnique.mockResolvedValue(null);

    await expect(profileSeenCapePersister.persist(EXISTING_MC_ID, 123n, today)).resolves.toBeUndefined();

    expect(databaseClient.$transaction).toHaveBeenCalledTimes(1);
    expectFindUniqueCalled();

    expect(databaseTransaction.profileSeenCape.upsert).toHaveBeenCalledTimes(1);
    expect(databaseTransaction.profileSeenCape.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { profileId_capeId: { profileId: EXISTING_MC_ID, capeId: 123n } },
      create: {
        profileId: EXISTING_MC_ID,
        capeId: 123n,
        firstSeenUsing: today,
        lastSeenUsing: today
      },
      update: {
        firstSeenUsing: today,
        lastSeenUsing: today
      }
    } satisfies PrismaClient.Prisma.ProfileSeenCapeUpsertArgs));
  });

  test('Updating a cape seen last week to seen today', async () => {
    databaseTransaction.profileSeenCape.findUnique.mockResolvedValue({
      firstSeenUsing: lastWeek,
      lastSeenUsing: lastWeek
    } satisfies Partial<PrismaClient.ProfileSeenCape> as any);

    await expect(profileSeenCapePersister.persist(EXISTING_MC_ID, 123n, today)).resolves.toBeUndefined();

    expect(databaseClient.$transaction).toHaveBeenCalledTimes(1);
    expectFindUniqueCalled();

    expect(databaseTransaction.profileSeenCape.upsert).toHaveBeenCalledTimes(1);
    expect(databaseTransaction.profileSeenCape.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { profileId_capeId: { profileId: EXISTING_MC_ID, capeId: 123n } },
      create: {
        profileId: EXISTING_MC_ID,
        capeId: 123n,
        firstSeenUsing: today,
        lastSeenUsing: today
      },
      update: {
        firstSeenUsing: undefined,
        lastSeenUsing: today
      }
    } satisfies PrismaClient.Prisma.ProfileSeenCapeUpsertArgs));
  });

  test('Updating a cape seen last week to first seen last month', async () => {
    databaseTransaction.profileSeenCape.findUnique.mockResolvedValue({
      firstSeenUsing: lastWeek,
      lastSeenUsing: lastWeek
    } satisfies Partial<PrismaClient.ProfileSeenCape> as any);

    await expect(profileSeenCapePersister.persist(EXISTING_MC_ID, 123n, lastMonth)).resolves.toBeUndefined();

    expect(databaseClient.$transaction).toHaveBeenCalledTimes(1);
    expectFindUniqueCalled();

    expect(databaseTransaction.profileSeenCape.upsert).toHaveBeenCalledTimes(1);
    expect(databaseTransaction.profileSeenCape.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { profileId_capeId: { profileId: EXISTING_MC_ID, capeId: 123n } },
      create: {
        profileId: EXISTING_MC_ID,
        capeId: 123n,
        firstSeenUsing: lastMonth,
        lastSeenUsing: lastMonth
      },
      update: {
        firstSeenUsing: lastMonth,
        lastSeenUsing: undefined
      }
    } satisfies PrismaClient.Prisma.ProfileSeenCapeUpsertArgs));
  });
});

function expectFindUniqueCalled(): void {
  expect(databaseTransaction.profileSeenCape.findUnique).toHaveBeenCalledTimes(1);
  expect(databaseTransaction.profileSeenCape.findUnique).toHaveBeenCalledWith(expect.objectContaining({
    where: { profileId_capeId: { profileId: EXISTING_MC_ID, capeId: 123n } }
  } satisfies PrismaClient.Prisma.ProfileSeenCapeFindUniqueArgs));
}
