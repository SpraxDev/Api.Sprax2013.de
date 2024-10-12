import { autoInjectable } from 'tsyringe';
import AutoProxiedHttpClient from '../../../http/clients/AutoProxiedHttpClient.js';
import MinecraftProfile from '../../value-objects/MinecraftProfile.js';
import { CapeType } from '../CapeType.js';
import CapeProvider, { CapeResponse } from './CapeProvider.js';

@autoInjectable()
export default class LabymodCapeProvider implements CapeProvider {
  constructor(
    private readonly httpClient: AutoProxiedHttpClient
  ) {
  }

  get capeType(): CapeType {
    return CapeType.LABYMOD;
  }

  async provide(profile: MinecraftProfile): Promise<CapeResponse | null> {
    const capeUrl = `https://dl.labymod.net/capes/${this.addHyphensToId(profile.id)}`;

    const capeResponse = await this.httpClient.get(capeUrl);
    if (capeResponse.statusCode === 404) {
      return null;
    }
    if (!capeResponse.ok) {
      throw new Error(`Failed to fetch cape from ${capeUrl} (status code ${capeResponse.statusCode})`);
    }
    if (capeResponse.body.byteLength === 0) {
      return null;
    }

    return {
      image: capeResponse.body,
      mimeType: 'image/png',
      ageInSeconds: 0
    };
  }

  private addHyphensToId(str: string): string {
    return str.replace(/-/g, '').replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5');
  }
}
