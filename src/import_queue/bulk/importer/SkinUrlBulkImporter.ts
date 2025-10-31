import * as PrismaClient from '@prisma/client';
import type AutoProxiedHttpClient from '../../../http/clients/AutoProxiedHttpClient.js';
import type BulkImporter from './BulkImporter.js';

export default class SkinUrlBulkImporter implements BulkImporter {
  constructor(
    private readonly httpClient: AutoProxiedHttpClient,
  ) {
  }

  isValidPayload(payload: string): true | string {
    try {
      new URL(payload);
      return true;
    } catch (err: any) {
      return `Invalid URL (${err.message}): ${JSON.stringify(payload)}`;
    }
  }

  async createTasks(payload: string, importGroupId: bigint): Promise<PrismaClient.Prisma.ImportTaskCreateManyInput[]> {
    const skinImage = await this.httpClient.get(payload);
    if (skinImage.statusCode === 404) {
      console.warn('Skin URL returned 404 Not Found: ' + payload);
      return [];
    }
    if (skinImage.statusCode !== 200) {
      console.error(`Skin URL returned unexpected status code ${skinImage.statusCode}: ` + payload);
      return [];
    }

    const contentType = skinImage.headers.get('content-type');
    if (typeof contentType === 'string' && !contentType.includes('image/') && contentType !== 'binary/octet-stream') {
      console.error(`Skin URL returned unexpected content type ${contentType}: ` + payload);
      return [];
    }

    return [{
      payload: skinImage.body,
      payloadType: 'SKIN_IMAGE',
      importGroupId,
    }];
  }
}
