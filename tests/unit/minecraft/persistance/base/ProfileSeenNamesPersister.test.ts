import { jest } from '@jest/globals';
import * as PrismaClient from '@prisma/client';
import { DeepMockProxy } from 'jest-mock-extended';
import DatabaseClient from '../../../../../src/database/DatabaseClient.js';
import ProfileSeenNamesPersister from '../../../../../src/minecraft/persistance/base/ProfileSeenNamesPersister.js';
import { EXISTING_MC_ID, EXISTING_MC_NAME } from '../../../../test-constants.js';
import { createStrictDeepMock } from '../../../../test-helpers.js';

let databaseClient: DeepMockProxy<DatabaseClient>;
let databaseTransaction: DeepMockProxy<PrismaClient.PrismaClient>;
let profileSeenNamesPersister: ProfileSeenNamesPersister;

beforeEach(() => {
  databaseTransaction = createStrictDeepMock<PrismaClient.PrismaClient>({
    profileSeenNames: {
      upsert: jest.fn<any>().mockResolvedValue(undefined)
    }
  });
  databaseClient = createStrictDeepMock<DatabaseClient>({
    $transaction: jest.fn<any>().mockImplementation((fn: any) => fn(databaseTransaction))
  });

  profileSeenNamesPersister = new ProfileSeenNamesPersister(databaseClient);
});

describe('#persist', () => {
  const lastMonth = new Date('2024-04-14');
  const lastWeek = new Date('2024-05-07');
  const today = new Date('2024-05-14');

  test('Does nothing, when provided timestamp does not change the already persisted data', async () => {
    databaseTransaction.profileSeenNames.findUnique.mockResolvedValue({
      firstSeenUsing: lastWeek,
      lastSeenUsing: today
    } satisfies Partial<PrismaClient.ProfileSeenNames> as any);

    await expect(profileSeenNamesPersister.persist(EXISTING_MC_ID, EXISTING_MC_NAME, today)).resolves.toBeUndefined();

    expect(databaseClient.$transaction).toHaveBeenCalledTimes(1);
    expectFindUniqueCalled();

    expect(databaseTransaction.profileSeenNames.upsert).toHaveBeenCalledTimes(0);
  });

  test.each([null, today])('Persisting a never-seen name (seenAt=%j)', async (seenAt: Date | null) => {
    databaseClient.fetchNow.mockResolvedValue(today);
    databaseTransaction.profileSeenNames.findUnique.mockResolvedValue(null);

    await expect(profileSeenNamesPersister.persist(EXISTING_MC_ID, EXISTING_MC_NAME, seenAt)).resolves.toBeUndefined();

    expect(databaseClient.$transaction).toHaveBeenCalledTimes(1);
    expectFindUniqueCalled();

    expect(databaseTransaction.profileSeenNames.upsert).toHaveBeenCalledTimes(1);
    expect(databaseTransaction.profileSeenNames.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { profileId_nameLowercase: { profileId: EXISTING_MC_ID, nameLowercase: EXISTING_MC_NAME.toLowerCase() } },
      create: {
        profileId: EXISTING_MC_ID,
        nameLowercase: EXISTING_MC_NAME.toLowerCase(),
        firstSeen: today,
        lastSeen: today
      },
      update: {
        firstSeen: today,
        lastSeen: today
      }
    } satisfies PrismaClient.Prisma.ProfileSeenNamesUpsertArgs));

    expect(databaseClient.fetchNow).toHaveBeenCalledTimes(seenAt == null ? 1 : 0);
    if (seenAt == null) {
      expect(databaseClient.fetchNow).toHaveBeenCalledWith(databaseTransaction);
    }
  });

  test('Updating a name seen last week to seen today', async () => {
    databaseTransaction.profileSeenNames.findUnique.mockResolvedValue({
      firstSeen: lastWeek,
      lastSeen: lastWeek
    } satisfies Partial<PrismaClient.ProfileSeenNames> as any);

    await expect(profileSeenNamesPersister.persist(EXISTING_MC_ID, EXISTING_MC_NAME, today)).resolves.toBeUndefined();

    expect(databaseClient.$transaction).toHaveBeenCalledTimes(1);
    expectFindUniqueCalled();

    expect(databaseTransaction.profileSeenNames.upsert).toHaveBeenCalledTimes(1);
    expect(databaseTransaction.profileSeenNames.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { profileId_nameLowercase: { profileId: EXISTING_MC_ID, nameLowercase: EXISTING_MC_NAME.toLowerCase() } },
      create: {
        profileId: EXISTING_MC_ID,
        nameLowercase: EXISTING_MC_NAME.toLowerCase(),
        firstSeen: today,
        lastSeen: today
      },
      update: {
        firstSeen: undefined,
        lastSeen: today
      }
    } satisfies PrismaClient.Prisma.ProfileSeenNamesUpsertArgs));
  });

  test('Updating a name seen last week to first seen last month', async () => {
    databaseTransaction.profileSeenNames.findUnique.mockResolvedValue({
      firstSeen: lastWeek,
      lastSeen: lastWeek
    } satisfies Partial<PrismaClient.ProfileSeenNames> as any);

    await expect(profileSeenNamesPersister.persist(EXISTING_MC_ID, EXISTING_MC_NAME, lastMonth)).resolves.toBeUndefined();

    expect(databaseClient.$transaction).toHaveBeenCalledTimes(1);
    expectFindUniqueCalled();

    expect(databaseTransaction.profileSeenNames.upsert).toHaveBeenCalledTimes(1);
    expect(databaseTransaction.profileSeenNames.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { profileId_nameLowercase: { profileId: EXISTING_MC_ID, nameLowercase: EXISTING_MC_NAME.toLowerCase() } },
      create: {
        profileId: EXISTING_MC_ID,
        nameLowercase: EXISTING_MC_NAME.toLowerCase(),
        firstSeen: lastMonth,
        lastSeen: lastMonth
      },
      update: {
        firstSeen: lastMonth,
        lastSeen: undefined
      }
    } satisfies PrismaClient.Prisma.ProfileSeenNamesUpsertArgs));
  });
});

function expectFindUniqueCalled(): void {
  expect(databaseTransaction.profileSeenNames.findUnique).toHaveBeenCalledTimes(1);
  expect(databaseTransaction.profileSeenNames.findUnique).toHaveBeenCalledWith(expect.objectContaining({
    where: { profileId_nameLowercase: { profileId: EXISTING_MC_ID, nameLowercase: EXISTING_MC_NAME.toLowerCase() } }
  } satisfies PrismaClient.Prisma.ProfileSeenNamesFindUniqueArgs));
}
