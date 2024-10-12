import * as PrismaClient from '@prisma/client';
import { singleton } from 'tsyringe';
import { CapeType } from '../../../minecraft/cape/CapeType.js';
import UserCapeService from '../../../minecraft/cape/UserCapeService.js';
import MinecraftSkinCache from '../../../minecraft/skin/MinecraftSkinCache.js';
import MinecraftSkinService from '../../../minecraft/skin/MinecraftSkinService.js';
import MinecraftProfile from '../../../minecraft/value-objects/MinecraftProfile.js';
import MinecraftProfileTextures from '../../../minecraft/value-objects/MinecraftProfileTextures.js';
import YggdrasilSignatureChecker from '../../../minecraft/yggdrasil/YggdrasilSignatureChecker.js';
import PayloadProcessor from './PayloadProcessor.js';

@singleton()
export default class ProfileTextureValueProcessor implements PayloadProcessor {
  constructor(
    private readonly yggdrasilSignatureChecker: YggdrasilSignatureChecker,
    private readonly minecraftSkinCache: MinecraftSkinCache,
    private readonly minecraftSkinService: MinecraftSkinService,
    private readonly userCapeService: UserCapeService
  ) {
  }

  async process(task: PrismaClient.ImportTask): Promise<boolean> {
    const payload = this.parsePayload(task);
    const parsedTextures = MinecraftProfileTextures.fromPropertyValue(payload.value);

    const skinUrl = parsedTextures.getSecureSkinUrl()!;
    if (await this.minecraftSkinCache.existsSkinUrlWithNonNullTextureValue(skinUrl)) {
      return false;
    }

    const storeTextureValue = await this.shouldBePersistedWithTextureValue(skinUrl, payload.value, payload.signature);
    const skinTexturesToPersist = storeTextureValue ? {
      name: 'textures',
      value: payload.value,
      signature: payload.signature as string
    } : undefined;

    await this.minecraftSkinService.fetchAndPersistSkin(skinUrl, skinTexturesToPersist);
    await this.userCapeService.provide(MinecraftProfile.recreateFromTextures(payload.value, payload.signature), CapeType.MOJANG);

    return true;
  }

  private async shouldBePersistedWithTextureValue(url: string, textureValue: string, textureSignature?: string): Promise<boolean> {
    if (textureSignature == null || !MinecraftProfileTextures.isOfficialSkinUrl(url)) {
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
      signature: parsedPayload.signature
    };
  }
}
