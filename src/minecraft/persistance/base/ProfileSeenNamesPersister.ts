import { singleton } from 'tsyringe';
import DatabaseClient from '../../../database/DatabaseClient.js';

// TODO: Seen Capes, Skins and Names have very similar code – Maybe we can refactor this?
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
      const updateNameSeenEntry = existingNameSeenEntry == null || existingNameSeenEntry.lastSeen < seenAt;
      if (!updateNameSeenEntry) {
        return;
      }

      const overrideSkinFirstSeenUsing = existingNameSeenEntry != null && existingNameSeenEntry.firstSeen > seenAt;
      const overrideSkinLastSeenUsing = existingNameSeenEntry != null && existingNameSeenEntry.lastSeen < seenAt;
      await transaction.profileSeenNames.upsert({
        where: { profileId_nameLowercase: { profileId, nameLowercase } },
        create: {
          profileId,
          nameLowercase,
          firstSeen: seenAt,
          lastSeen: seenAt
        },
        update: {
          firstSeen: overrideSkinFirstSeenUsing ? seenAt : undefined,
          lastSeen: overrideSkinLastSeenUsing ? seenAt : undefined
        }
      });
    });
  }
}
