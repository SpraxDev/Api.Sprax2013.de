import { autoInjectable } from 'tsyringe';
import HttpClient from '../../../http/HttpClient.js';
import MinecraftProfile from '../../value-objects/MinecraftProfile.js';
import { CapeType } from '../CapeType.js';
import CapeProvider, { CapeResponse } from './CapeProvider.js';

@autoInjectable()
export default class MojangCapeProvider implements CapeProvider {
  constructor(
    private readonly httpClient: HttpClient
  ) {
  }

  get capeType(): CapeType {
    return CapeType.MOJANG;
  }

  async provide(profile: MinecraftProfile): Promise<CapeResponse | null> {
    const capeUrl = profile.parseTextures()?.capeUrl;
    if (capeUrl == null) {
      return null;
    }

    const capeResponse = await this.httpClient.get(capeUrl);
    if (!capeResponse.ok) {
      throw new Error(`Failed to fetch cape from ${capeUrl}`);
    }

    if (!(capeResponse.headers.get('content-type') ?? '').includes('image/png')) {
      throw new Error(`Failed to fetch cape from ${capeUrl}: Content-Type is not image/png (got ${capeResponse.headers.get('content-type')})`);
    }

    return {
      image: capeResponse.body,
      mimeType: 'image/png'
    };
  }
}
