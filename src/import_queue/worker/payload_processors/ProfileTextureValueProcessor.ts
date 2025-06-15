import * as PrismaClient from '@prisma/client';
import { singleton } from 'tsyringe';
import AutoProxiedHttpClient from '../../../http/clients/AutoProxiedHttpClient.js';
import SkinPersister from '../../../minecraft/persistance/base/SkinPersister.js';
import ByTexturesPropertyPersister from '../../../minecraft/persistance/ByTexturesPropertyPersister.js';
import MinecraftSkinNormalizer from '../../../minecraft/skin/manipulator/MinecraftSkinNormalizer.js';
import SkinImageManipulator from '../../../minecraft/skin/manipulator/SkinImageManipulator.js';
import MinecraftSkinCache from '../../../minecraft/skin/MinecraftSkinCache.js';
import { SkinRequestFailedException } from '../../../minecraft/skin/MinecraftSkinService.js';
import MinecraftProfileTextures from '../../../minecraft/value-objects/MinecraftProfileTextures.js';
import YggdrasilSignatureChecker from '../../../minecraft/yggdrasil/YggdrasilSignatureChecker.js';
import PayloadProcessor from './PayloadProcessor.js';

@singleton()
export default class ProfileTextureValueProcessor implements PayloadProcessor {
  constructor(
    private readonly yggdrasilSignatureChecker: YggdrasilSignatureChecker,
    private readonly minecraftSkinCache: MinecraftSkinCache,
    private readonly httpClient: AutoProxiedHttpClient,
    private readonly minecraftSkinNormalizer: MinecraftSkinNormalizer,
    private readonly skinPersister: SkinPersister,
    private readonly byTexturesPropertyPersister: ByTexturesPropertyPersister,
  ) {
  }

  // TODO: Improve on "new" detection (return value)
  async process(task: PrismaClient.ImportTask): Promise<boolean> {
    const payload = this.parsePayload(task);
    const parsedTextures = MinecraftProfileTextures.fromPropertyValue(payload.value);

    const skinUrl = parsedTextures.getSecureSkinUrl();

    const texturePropertiesAreValid = await this.shouldBePersistedWithTextureValue(skinUrl, payload.value, payload.signature);
    if (texturePropertiesAreValid) {
      await this.byTexturesPropertyPersister.persist({ value: payload.value, signature: payload.signature! });
      return true;
    }

    if (skinUrl != null) {
      return await this.persistSkinByUrlIfNeeded(skinUrl);
    }

    // We don't manually import the Mojang Cape here because we only import them with a valid signature
    return false;
  }

  private async persistSkinByUrlIfNeeded(skinUrl: string): Promise<boolean> {
    if (!(await this.minecraftSkinCache.existsSkinUrlWithNonNullTextureValue(skinUrl))) {
      return false;
    }

    const skinImage = await this.httpClient.get(skinUrl);
    if (!skinImage.ok) {
      throw new SkinRequestFailedException(skinUrl, skinImage.statusCode);
    }

    const originalSkin = await SkinImageManipulator.createByImage(skinImage.body);
    const normalizedSkin = await this.minecraftSkinNormalizer.normalizeSkin(originalSkin);

    await this.skinPersister.persist(skinImage.body, await normalizedSkin.toPngBuffer(), skinUrl);
    return true;
  }

  private async shouldBePersistedWithTextureValue(skinUrl: string | null, textureValue: string, textureSignature?: string): Promise<boolean> {
    if (skinUrl == null || textureSignature == null || !MinecraftProfileTextures.isOfficialTextureUrl(skinUrl)) {
      return false;
    }
    return this.yggdrasilSignatureChecker.checkProfileProperty(textureValue, textureSignature);
  }

  private parsePayload(task: PrismaClient.ImportTask): { value: string, signature?: string } {
    const parsedPayload = JSON.parse(task.payload.toString('utf-8'));
    if (typeof parsedPayload.value !== 'string') {
      throw new Error('Invalid payload: Missing "value" property');
    }
    if (parsedPayload.signature != null && typeof parsedPayload.signature !== 'string') {
      throw new Error('Invalid payload: Invalid "signature" property');
    }

    return {
      value: parsedPayload.value,
      signature: parsedPayload.signature,
    };
  }
}
