import type * as PrismaClient from '@prisma/client';
import { singleton } from 'tsyringe';
import DatabaseClient from '../../../database/DatabaseClient.js';

@singleton()
export default class ProfileSeenNamesPersister {
  constructor(
    private readonly databaseClient: DatabaseClient
  ) {
  }

  async persist(profileId: string, name: string, seenAt: Date | null): Promise<void> {
    const nameLowercase = name.toLowerCase();

    await this.databaseClient.$transaction(async (transaction) => {
      if (seenAt == null) {
        seenAt = await this.databaseClient.fetchNow(transaction);
      }

      const existingNameSeenEntry = await transaction.profileSeenNames.findUnique({
        where: { profileId_nameLowercase: { profileId, nameLowercase } },
        select: { firstSeen: true, lastSeen: true }
      });
      if (!this.shouldUpdateTimestamps(existingNameSeenEntry, seenAt)) {
        return;
      }

      const overrideFirstSeenUsing = existingNameSeenEntry == null || existingNameSeenEntry.firstSeen > seenAt;
      const overrideLastSeenUsing = existingNameSeenEntry == null || existingNameSeenEntry.lastSeen < seenAt;
      await transaction.profileSeenNames.upsert({
        where: { profileId_nameLowercase: { profileId, nameLowercase } },
        create: {
          profileId,
          nameLowercase,
          firstSeen: seenAt,
          lastSeen: seenAt
        },
        update: {
          firstSeen: overrideFirstSeenUsing ? seenAt : undefined,
          lastSeen: overrideLastSeenUsing ? seenAt : undefined
        },
        select: { nameLowercase: true }
      });
    });
  }

  private shouldUpdateTimestamps(
    existingCapeSeenEntry: Pick<PrismaClient.ProfileSeenNames, 'firstSeen' | 'lastSeen'> | null,
    seenAt: Date
  ): boolean {
    return existingCapeSeenEntry == null ||
      existingCapeSeenEntry.lastSeen < seenAt ||
      existingCapeSeenEntry.firstSeen > seenAt;
  }
}
