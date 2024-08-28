import { autoInjectable } from 'tsyringe';
import HttpClient from '../../../http/HttpClient.js';
import MinecraftProfile from '../../value-objects/MinecraftProfile.js';
import { CapeType } from '../CapeType.js';
import CapeProvider, { CapeResponse } from './CapeProvider.js';

@autoInjectable()
export default class OptifineCapeProvider implements CapeProvider {
  constructor(
    private readonly httpClient: HttpClient
  ) {
  }

  get capeType(): CapeType {
    return CapeType.OPTIFINE;
  }

  async provide(profile: MinecraftProfile): Promise<CapeResponse | null> {
    const capeUrl = `http://s.optifine.net/capes/${profile.name}.png`;

    const capeResponse = await this.httpClient.get(capeUrl);
    if (capeResponse.statusCode === 404) {
      return null;
    }
    if (!capeResponse.ok) {
      throw new Error(`Failed to fetch cape from ${capeUrl} (status code ${capeResponse.statusCode})`);
    }

    if (capeResponse.headers.get('content-type') !== 'image/png') {
      throw new Error(`Failed to fetch cape from ${capeUrl}: Content-Type is not image/png (got ${capeResponse.headers.get('content-type')})`);
    }

    return {
      image: capeResponse.body,
      mimeType: 'image/png'
    };
  }
}
