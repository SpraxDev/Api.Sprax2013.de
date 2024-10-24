import * as PrismaClient from '@prisma/client';
import { singleton } from 'tsyringe';
import SkinPersister from '../../../minecraft/persistance/base/SkinPersister.js';
import MinecraftSkinNormalizer from '../../../minecraft/skin/manipulator/MinecraftSkinNormalizer.js';
import SkinImageManipulator from '../../../minecraft/skin/manipulator/SkinImageManipulator.js';
import MinecraftSkinCache from '../../../minecraft/skin/MinecraftSkinCache.js';
import PayloadProcessor from './PayloadProcessor.js';

@singleton()
export default class SkinImageProcessor implements PayloadProcessor {
  constructor(
    private readonly minecraftSkinCache: MinecraftSkinCache,
    private readonly minecraftSkinNormalizer: MinecraftSkinNormalizer,
    private readonly skinPersister: SkinPersister
  ) {
  }

  async process(task: PrismaClient.ImportTask): Promise<boolean> {
    if (await this.minecraftSkinCache.existsByImageBytes(task.payload)) {
      return false;
    }

    const originalSkin = await SkinImageManipulator.createByImage(task.payload);
    const normalizedSkin = await this.minecraftSkinNormalizer.normalizeSkin(originalSkin);

    await this.skinPersister.persist(task.payload, await normalizedSkin.toPngBuffer(), null);
    return true;
  }
}
