import { singleton } from 'tsyringe';
import TrustedProxiedHttpClient from '../http/clients/TrustedProxiedHttpClient.js';

export type UsernameToUuidResponse = {
  id: string;
  name: string;
};

export type UuidToProfileResponse = {
  id: string;
  name: string;
  properties: {
    name: string;
    value: string;
    signature: string;
  }[];
  profileActions: string[];
}

@singleton()
export default class MinecraftApiClient {
  constructor(
    private readonly httpClient: TrustedProxiedHttpClient
  ) {
  }

  async fetchUuidForUsername(username: string): Promise<UsernameToUuidResponse | null> {
    const response = await this.httpClient.get(`https://api.minecraftservices.com/minecraft/profile/lookup/name/${username}`);
    if (response.statusCode === 204 || response.statusCode === 404) {
      return null;
    }

    if (!response.ok) {
      throw new Error(`Failed to get UUID for username '${username}': {status=${response.statusCode}, body=${response.parseBodyAsText()}}`);
    }
    return response.parseBodyAsJson();  // TODO: maybe verify the response contains the expected data
  }

  async fetchProfileForUuid(uuid: string): Promise<UuidToProfileResponse | null> {
    const response = await this.httpClient.get(`https://sessionserver.mojang.com/session/minecraft/profile/${uuid}?unsigned=false`);
    if (response.statusCode === 204 || response.statusCode === 404) {
      return null;
    }

    if (!response.ok) {
      throw new Error(`Failed to get profile for UUID '${uuid}': {status=${response.statusCode}, body=${response.parseBodyAsText()}}`);
    }
    return response.parseBodyAsJson();  // TODO: maybe verify the response contains the expected data
  }

  async fetchListOfBlockedServers(): Promise<string[]> {
    const response = await this.httpClient.get('https://sessionserver.mojang.com/blockedservers', { headers: { 'Accept': 'text/plain' } });
    if (!response.ok) {
      throw new Error(`Failed to get list of blocked servers: {status=${response.statusCode}, body=${response.parseBodyAsText()}}`);
    }

    const hashes = response
      .parseBodyAsText()
      .trim()
      .split('\n');
    if (!hashes.every(hash => hash.length === 40)) {
      throw new Error(`Failed to get list of blocked servers: One or more lines are not valid SHA-1 hashes`);
    }
    return hashes;
  }
}
