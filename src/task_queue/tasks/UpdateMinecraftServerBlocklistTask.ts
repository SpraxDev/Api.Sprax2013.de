import Crypto from 'node:crypto';
import { injectable } from 'tsyringe';
import MinecraftApiClient from '../../minecraft/MinecraftApiClient.js';
import ServerBlocklistPersister from '../../minecraft/server/ServerBlocklistPersister.js';
import Task, { TaskPriority } from './Task.js';

@injectable()
export default class UpdateMinecraftServerBlocklistTask extends Task {
  private lastContentHash: Buffer | null = null;

  constructor(
    private readonly minecraftApiClient: MinecraftApiClient,
    private readonly serverBlocklistPersister: ServerBlocklistPersister
  ) {
    super('UpdateMinecraftServerBlocklist', TaskPriority.NORMAL);
  }

  async run(): Promise<void> {
    const blocklist = await this.minecraftApiClient.fetchListOfBlockedServers();
    const contentHash = this.hashBlocklist(blocklist);

    if (this.lastContentHash != null && this.lastContentHash.equals(contentHash)) {
      return;
    }

    console.time('Updated Minecraft server blocklist');
    this.lastContentHash = contentHash;
    await this.serverBlocklistPersister.updateBlocklistInDatabase(blocklist);
    console.timeEnd('Updated Minecraft server blocklist');
  }

  equals(other: Task): boolean {
    return other instanceof UpdateMinecraftServerBlocklistTask;
  }

  private hashBlocklist(blocklist: string[]): Buffer {
    const hash = Crypto.createHash('sha1');
    hash.update(blocklist.join());
    return hash.digest();
  }
}
