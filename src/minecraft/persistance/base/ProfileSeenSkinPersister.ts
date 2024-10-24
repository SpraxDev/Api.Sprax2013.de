import { singleton } from 'tsyringe';
import DatabaseClient from '../../../database/DatabaseClient.js';

@singleton()
export default class ProfileSeenSkinPersister {
  constructor(
    private readonly databaseClient: DatabaseClient
  ) {
  }

  async persist(profileId: string, skinId: bigint, seenAt: Date): Promise<void> {
    await this.databaseClient.$transaction(async (transaction) => {
      const existingSkinSeenEntry = await transaction.profileSeenSkin.findUnique({
        where: { profileId_skinId: { profileId, skinId } },
        select: { firstSeenUsing: true, lastSeenUsing: true }
      });
      const updateSkinSeenEntry = existingSkinSeenEntry == null || existingSkinSeenEntry.lastSeenUsing < seenAt;
      if (!updateSkinSeenEntry) {
        return;
      }

      const overrideSkinFirstSeenUsing = existingSkinSeenEntry != null && existingSkinSeenEntry.firstSeenUsing > seenAt;
      const overrideSkinLastSeenUsing = existingSkinSeenEntry != null && existingSkinSeenEntry.lastSeenUsing < seenAt;
      await transaction.profileSeenSkin.upsert({
        where: { profileId_skinId: { profileId, skinId } },
        create: {
          profileId,
          skinId,
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
