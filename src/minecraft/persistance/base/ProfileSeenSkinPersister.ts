import type * as PrismaClient from '@prisma/client';
import { singleton } from 'tsyringe';
import DatabaseClient from '../../../database/DatabaseClient.js';

@singleton()
export default class ProfileSeenSkinPersister {
  constructor(
    private readonly databaseClient: DatabaseClient,
  ) {
  }

  async persist(profileId: string, skinId: bigint, seenAt: Date): Promise<void> {
    await this.databaseClient.$transaction(async (transaction) => {
      const existingSkinSeenEntry = await transaction.profileSeenSkin.findUnique({
        where: { profileId_skinId: { profileId, skinId } },
        select: { firstSeenUsing: true, lastSeenUsing: true },
      });
      if (!this.shouldUpdateTimestamps(existingSkinSeenEntry, seenAt)) {
        return;
      }

      const overrideFirstSeenUsing = existingSkinSeenEntry == null || existingSkinSeenEntry.firstSeenUsing > seenAt;
      const overrideLastSeenUsing = existingSkinSeenEntry == null || existingSkinSeenEntry.lastSeenUsing < seenAt;
      await transaction.profileSeenSkin.upsert({
        where: { profileId_skinId: { profileId, skinId } },
        create: {
          profileId,
          skinId,
          firstSeenUsing: seenAt,
          lastSeenUsing: seenAt,
        },
        update: {
          firstSeenUsing: overrideFirstSeenUsing ? seenAt : undefined,
          lastSeenUsing: overrideLastSeenUsing ? seenAt : undefined,
        },
        select: { skinId: true },
      });
    });
  }

  private shouldUpdateTimestamps(
    existingCapeSeenEntry: Pick<PrismaClient.ProfileSeenSkin, 'firstSeenUsing' | 'lastSeenUsing'> | null,
    seenAt: Date,
  ): boolean {
    return existingCapeSeenEntry == null ||
      existingCapeSeenEntry.lastSeenUsing < seenAt ||
      existingCapeSeenEntry.firstSeenUsing > seenAt;
  }
}
