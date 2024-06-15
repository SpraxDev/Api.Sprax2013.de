import { singleton } from 'tsyringe';
import MinecraftApiClient from './MinecraftApiClient.js';

@singleton()
export default class ServerBlocklistService {
  constructor(
    private readonly minecraftApiClient: MinecraftApiClient
  ) {
  }

  async provideBlocklist(): Promise<string[]> {
    return this.minecraftApiClient.fetchListOfBlockedServers();
  }
}
