import { injectable } from 'tsyringe';
import DatabaseClient from '../../database/DatabaseClient.js';

@injectable()
export default class Arbeitsbeschaffungsmassnahme {
  private static readonly NO_UUIDS_TO_UPDATE_TIMEOUT = 60_000;

  private lastNoUuidsToUpdate = -1;
  private uuidsToUpdate: string[] = [];

  constructor(
    private readonly databaseClient: DatabaseClient
  ) {
  }

  async nextUuidToUpdate(): Promise<string | null> {
    if (this.uuidsToUpdate.length == 0) {
      const shouldFetchNewBatch = this.lastNoUuidsToUpdate < (Date.now() - Arbeitsbeschaffungsmassnahme.NO_UUIDS_TO_UPDATE_TIMEOUT);
      if (!shouldFetchNewBatch) {
        return null;
      }

      this.uuidsToUpdate = await this.fetchUuidsToUpdate();
    }

    return this.uuidsToUpdate.shift() ?? null;
  }

  private async fetchUuidsToUpdate(): Promise<string[]> {
    const now = await this.databaseClient.fetchNow();
    const uuidsToUpdate = await this.databaseClient.profile.findMany({
      select: { id: true },
      where: {
        deleted: false,
        updatedAt: {
          lt: new Date(now.getTime() - 24 * 60 * 60 * 1000 /* 1d */)
        }
      },
      orderBy: {
        updatedAt: 'asc'
      },
      take: 10
    });

    if (uuidsToUpdate.length == 0) {
      this.lastNoUuidsToUpdate = Date.now();
    }
    return uuidsToUpdate.map(uuid => uuid.id.replaceAll('-', ''));
  }
}
