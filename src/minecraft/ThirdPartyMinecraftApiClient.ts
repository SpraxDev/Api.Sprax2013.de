import { container, singleton } from 'tsyringe';
import AutoProxiedHttpClient from '../http/clients/AutoProxiedHttpClient.js';
import type { UsernameToUuidResponse } from './MinecraftApiClient.js';
import MinecraftProfileService from './profile/MinecraftProfileService.js';

@singleton()
export default class ThirdPartyMinecraftApiClient {
  private _minecraftProfileService: MinecraftProfileService | undefined;

  constructor(
    private readonly httpClient: AutoProxiedHttpClient,
  ) {
  }

  // FIXME: Because of circular dependencies, we need to lazy load this dependency (Find a better way to do this)
  private get minecraftProfileService(): MinecraftProfileService {
    if (this._minecraftProfileService === undefined) {
      this._minecraftProfileService = container.resolve(MinecraftProfileService);
    }
    return this._minecraftProfileService;
  }

  async fetchUuidForUsername(username: string): Promise<UsernameToUuidResponse | null> {
    const response = await this.httpClient.get(`https://mcproxy.dev/uuid/${username}`);
    if (response.statusCode !== 200) {
      throw new Error(`Failed to get UUID for username '${username}' from mcproxy.dev (Expected status 200): {status=${response.statusCode}, body=${response.parseBodyAsText()}}`);
    }

    const responseBody = response.parseBodyAsJson<any>();

    if (typeof responseBody.status !== 'number') {
      throw new Error(`Failed to get UUID for username '${username}' from mcproxy.dev (Expected status to be of type number): {body=${response.parseBodyAsText()}}`);
    }

    if (responseBody.status === 404) {
      return null;
    }
    if (responseBody.status !== 200) {
      throw new Error(`Failed to get UUID for username '${username}' from mcproxy.dev (Expected status 200 or 404): {body=${response.parseBodyAsText()}}`);
    }

    if (typeof responseBody.data !== 'object' || responseBody.data === null || typeof responseBody.data.id !== 'string') {
      throw new Error(`Failed to get UUID for username '${username}' from mcproxy.dev (Expected data.id to be of type string): {body=${response.parseBodyAsText()}}`);
    }

    const uuid = responseBody.data.id as string;
    const profile = await this.minecraftProfileService.provideProfileByUuid(uuid);
    if (profile == null || profile.profile.name.toLowerCase() !== username.toLowerCase()) {
      throw new Error(`Failed to get UUID for username '${username}' from mcproxy.dev (Profile for returned uuid (${uuid}) does not match the requested username)`);
    }

    return { id: profile.profile.id, name: profile.profile.name };
  }
}
