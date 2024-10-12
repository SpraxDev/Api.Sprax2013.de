import { autoInjectable } from 'tsyringe';
import AutoProxiedHttpClient from '../../../http/clients/AutoProxiedHttpClient.js';
import MinecraftProfile from '../../value-objects/MinecraftProfile.js';
import CapeCache from '../CapeCache.js';
import { CapeType } from '../CapeType.js';
import CapeProvider, { CapeResponse } from './CapeProvider.js';

@autoInjectable()
export default class MojangCapeProvider implements CapeProvider {
  constructor(
    private readonly httpClient: AutoProxiedHttpClient,
    private readonly capeCache: CapeCache
  ) {
  }

  get capeType(): CapeType {
    return CapeType.MOJANG;
  }

  async provide(profile: MinecraftProfile): Promise<CapeResponse | null> {
    const capeUrl = profile.parseTextures()?.getSecureCapeUrl();
    if (capeUrl == null) {
      return null;
    }

    const cachedCape = await this.capeCache.findByTypeAndUrl(CapeType.MOJANG, capeUrl);
    if (cachedCape != null) {
      return {
        image: cachedCape.imageBytes,
        mimeType: cachedCape.mimeType,
        ageInSeconds: 0
      };
    }

    return this.fetchCape(capeUrl);
  }

  private async fetchCape(capeUrl: string): Promise<CapeResponse> {
    const capeResponse = await this.httpClient.get(capeUrl);
    if (!capeResponse.ok) {
      throw new Error(`Failed to fetch cape from ${capeUrl} (status code ${capeResponse.statusCode})`);
    }

    const contentType = capeResponse.headers.get('content-type') ?? '';
    if (!contentType.includes('image/png') && !contentType.includes('application/octet-stream')) {
      throw new Error(`Failed to fetch cape from ${capeUrl}: Content-Type is not image/png (or application/octet-stream) (got ${contentType})`);
    }

    return {
      image: capeResponse.body,
      mimeType: 'image/png',
      ageInSeconds: 0
    };
  }
}
