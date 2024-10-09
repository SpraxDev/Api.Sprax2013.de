import Fs from 'node:fs';
import Path from 'node:path';
import { singleton } from 'tsyringe';
import { APP_RESOURCES_DIR } from '../../constants.js';
import AutoProxiedHttpClient from '../../http/clients/AutoProxiedHttpClient.js';
import LazyImportTaskCreator from '../../import_queue/LazyImportTaskCreator.js';
import { UuidToProfileResponse } from '../MinecraftApiClient.js';
import MinecraftProfile, { DefaultSkin } from '../value-objects/MinecraftProfile.js';
import MinecraftSkinNormalizer from './manipulator/MinecraftSkinNormalizer.js';
import SkinImageManipulator from './manipulator/SkinImageManipulator.js';
import MinecraftSkinCache, { CachedSkin } from './MinecraftSkinCache.js';

@singleton()
export default class MinecraftSkinService {
  private static readonly steve = Fs.promises.readFile(Path.join(APP_RESOURCES_DIR, 'steve.png'));
  private static readonly alex = Fs.promises.readFile(Path.join(APP_RESOURCES_DIR, 'alex.png'));

  constructor(
    private readonly httpClient: AutoProxiedHttpClient,
    private readonly minecraftSkinCache: MinecraftSkinCache,
    private readonly minecraftSkinNormalizer: MinecraftSkinNormalizer,
    private readonly lazyImportTaskCreator: LazyImportTaskCreator
  ) {
  }

  async fetchEffectiveSkin(profile: MinecraftProfile): Promise<CachedSkin> {
    const skinUrl = profile.parseTextures()?.getSecureSkinUrl();
    if (skinUrl == null) {
      const defaultSkin = await this.getDefaultSkin(profile.determineDefaultSkin());
      return {
        original: defaultSkin,
        normalized: defaultSkin
      };
    }

    return this.fetchAndPersistSkin(skinUrl, profile.getTexturesProperty() ?? undefined);
  }

  async fetchAndPersistSkin(skinUrl: string, textureProperty?: UuidToProfileResponse['properties'][0]): Promise<CachedSkin> {
    const cachedSkin = await this.minecraftSkinCache.findByUrl(skinUrl);
    if (cachedSkin != null) {
      return cachedSkin;
    }

    const skinImage = await this.httpClient.get(skinUrl);
    if (!skinImage.ok) {
      throw new SkinRequestFailedException(skinUrl, skinImage.statusCode);
    }

    const originalSkin = await SkinImageManipulator.createByImage(skinImage.body);
    const normalizedSkin = await this.minecraftSkinNormalizer.normalizeSkin(originalSkin);

    const isMinecraftSkinUrl = new URL(skinUrl).hostname.endsWith('.minecraft.net');
    await this.minecraftSkinCache.persist(
      skinImage.body,
      await normalizedSkin.toPngBuffer(),
      isMinecraftSkinUrl ? skinUrl : null,
      isMinecraftSkinUrl ? textureProperty : undefined
    );

    return {
      original: originalSkin,
      normalized: normalizedSkin
    };
  }

  private async getDefaultSkin(skin: DefaultSkin): Promise<SkinImageManipulator> {
    if (skin === 'alex') {
      return SkinImageManipulator.createByImage(await MinecraftSkinService.alex);
    }
    return SkinImageManipulator.createByImage(await MinecraftSkinService.steve);
  }
}

export class SkinRequestFailedException extends Error {
  constructor(
    public readonly skinUrl: string,
    public readonly httpStatusCode: number
  ) {
    super(`Fetching skin '${skinUrl}' failed with HTTP status code ${httpStatusCode}`);
  }
}
