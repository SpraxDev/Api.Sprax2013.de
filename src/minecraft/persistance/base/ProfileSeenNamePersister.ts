import type * as PrismaClient from '@prisma/client';
import { singleton } from 'tsyringe';
import DatabaseClient from '../../../database/DatabaseClient.js';

@singleton()
export default class ProfileSeenNamePersister {
  constructor(
    private readonly databaseClient: DatabaseClient,
  ) {
  }

  async persist(profileId: string, name: string, seenAt: Date | null): Promise<void> {
    const nameLowercase = name.toLowerCase();

    await this.databaseClient.$transaction(async (transaction) => {
      if (seenAt == null) {
        seenAt = await this.databaseClient.fetchNow(transaction);
      }

      const existingNameSeenEntry = await transaction.profileSeenName.findUnique({
        where: { profileId_nameLowercase: { profileId, nameLowercase } },
        select: { firstSeenUsing: true, lastSeenUsing: true },
      });
      if (!this.shouldUpdateTimestamps(existingNameSeenEntry, seenAt)) {
        return;
      }

      const overrideFirstSeenUsing = existingNameSeenEntry == null || existingNameSeenEntry.firstSeenUsing > seenAt;
      const overrideLastSeenUsing = existingNameSeenEntry == null || existingNameSeenEntry.lastSeenUsing < seenAt;
      await transaction.profileSeenName.upsert({
        where: { profileId_nameLowercase: { profileId, nameLowercase } },
        create: {
          profileId,
          nameLowercase,
          firstSeenUsing: seenAt,
          lastSeenUsing: seenAt,
        },
        update: {
          firstSeenUsing: overrideFirstSeenUsing ? seenAt : undefined,
          lastSeenUsing: overrideLastSeenUsing ? seenAt : undefined,
        },
        select: { nameLowercase: true },
      });
    });
  }

  private shouldUpdateTimestamps(
    existingCapeSeenEntry: Pick<PrismaClient.ProfileSeenName, 'firstSeenUsing' | 'lastSeenUsing'> | null,
    seenAt: Date,
  ): boolean {
    return existingCapeSeenEntry == null ||
      existingCapeSeenEntry.lastSeenUsing < seenAt ||
      existingCapeSeenEntry.firstSeenUsing > seenAt;
  }
}
