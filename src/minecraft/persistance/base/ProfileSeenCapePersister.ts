import type * as PrismaClient from '@prisma/client';
import { singleton } from 'tsyringe';
import DatabaseClient from '../../../database/DatabaseClient.js';

@singleton()
export default class ProfileSeenCapePersister {
  constructor(
    private readonly databaseClient: DatabaseClient
  ) {
  }

  async persist(profileId: string, capeId: bigint, seenAt: Date): Promise<void> {
    await this.databaseClient.$transaction(async (transaction) => {
      const existingCapeSeenEntry = await transaction.profileSeenCape.findUnique({
        where: { profileId_capeId: { profileId, capeId } },
        select: { firstSeenUsing: true, lastSeenUsing: true }
      });
      if (!this.shouldUpdateTimestamps(existingCapeSeenEntry, seenAt)) {
        return;
      }

      const overrideFirstSeenUsing = existingCapeSeenEntry == null || existingCapeSeenEntry.firstSeenUsing > seenAt;
      const overrideLastSeenUsing = existingCapeSeenEntry == null || existingCapeSeenEntry.lastSeenUsing < seenAt;
      await transaction.profileSeenCape.upsert({
        where: { profileId_capeId: { profileId, capeId } },
        create: {
          profileId,
          capeId,
          firstSeenUsing: seenAt,
          lastSeenUsing: seenAt
        },
        update: {
          firstSeenUsing: overrideFirstSeenUsing ? seenAt : undefined,
          lastSeenUsing: overrideLastSeenUsing ? seenAt : undefined
        },
        select: { capeId: true }
      });
    });
  }

  private shouldUpdateTimestamps(
    existingCapeSeenEntry: Pick<PrismaClient.ProfileSeenCape, 'firstSeenUsing' | 'lastSeenUsing'> | null,
    seenAt: Date
  ): boolean {
    return existingCapeSeenEntry == null ||
      existingCapeSeenEntry.lastSeenUsing < seenAt ||
      existingCapeSeenEntry.firstSeenUsing > seenAt;
  }
}
