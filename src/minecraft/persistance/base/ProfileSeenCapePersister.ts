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
      const updateCapeSeenEntry = existingCapeSeenEntry == null || existingCapeSeenEntry.lastSeenUsing < seenAt;
      if (!updateCapeSeenEntry) {
        return;
      }

      const overrideSkinFirstSeenUsing = existingCapeSeenEntry != null && existingCapeSeenEntry.firstSeenUsing > seenAt;
      const overrideSkinLastSeenUsing = existingCapeSeenEntry != null && existingCapeSeenEntry.lastSeenUsing < seenAt;
      await transaction.profileSeenCape.upsert({
        where: { profileId_capeId: { profileId, capeId } },
        create: {
          profileId,
          capeId,
          firstSeenUsing: seenAt,
          lastSeenUsing: seenAt
        },
        update: {
          firstSeenUsing: overrideSkinFirstSeenUsing ? seenAt : undefined,
          lastSeenUsing: overrideSkinLastSeenUsing ? seenAt : undefined
        }
      });
    });
  }
}
