import type { Color } from '../../image/ImageManipulator.js';
import SkinImageManipulator from './SkinImageManipulator.js';

export default class MinecraftSkinNormalizer {
  private static readonly FIRST_SKIN_LAYER_AREAS = [
    { x: 8, y: 0, w: 16, h: 8 },
    { x: 0, y: 8, w: 32, h: 8 },

    { x: 0, y: 20, w: 56, h: 12 },
    { x: 4, y: 16, w: 8, h: 4 },
    { x: 20, y: 16, w: 16, h: 4 },
    { x: 44, y: 16, w: 8, h: 4 },

    { x: 16, y: 52, w: 16, h: 12 },
    { x: 32, y: 52, w: 16, h: 12 },
    { x: 20, y: 48, w: 8, h: 4 },
    { x: 36, y: 48, w: 8, h: 4 }
  ];

  private static readonly SECOND_SKIN_LAYER_AREAS = [
    { x: 40, y: 0, w: 16, h: 8 },
    { x: 32, y: 8, w: 32, h: 8 },

    { x: 0, y: 36, w: 56, h: 12 },
    { x: 4, y: 32, w: 8, h: 4 },
    { x: 20, y: 32, w: 16, h: 4 },
    { x: 44, y: 32, w: 8, h: 4 },

    { x: 0, y: 52, w: 16, h: 12 },
    { x: 48, y: 52, w: 16, h: 12 },
    { x: 4, y: 48, w: 8, h: 4 },
    { x: 52, y: 48, w: 8, h: 4 }
  ];

  async normalizeSkin(skin: SkinImageManipulator): Promise<SkinImageManipulator> {
    skin = await this.upgradeSkin(skin);
    this.removeUnusedSkinParts(skin);
    this.correctAlphaForFirstSkinLayer(skin);

    return skin;
  }

  enforceMinMaxAlphaOnSecondLayer(skinImageManipulator: SkinImageManipulator): void {
    const black = { r: 0, g: 0, b: 0, alpha: 0 };

    for (const area of MinecraftSkinNormalizer.SECOND_SKIN_LAYER_AREAS) {
      for (let i = 0; i < area.w; ++i) {
        for (let j = 0; j < area.h; ++j) {
          const x = area.x + i;
          const y = area.y + j;
          const color = skinImageManipulator.getColor(x, y);
          skinImageManipulator.setColor(x, y, color.alpha > 0 ? { ...color, alpha: 255 } : black);
        }
      }
    }
  }

  private async upgradeSkin(skinImageManipulator: SkinImageManipulator): Promise<SkinImageManipulator> {
    if (skinImageManipulator.height !== 32) {
      return skinImageManipulator;
    }

    const newImageManipulator = await SkinImageManipulator.createEmpty();

    // head
    newImageManipulator.drawSubImg(skinImageManipulator, 8, 0, 16, 8, 8, 0);
    newImageManipulator.drawSubImg(skinImageManipulator, 0, 8, 32, 8, 0, 8);

    // body
    newImageManipulator.drawSubImg(skinImageManipulator, 0, 20, 56, 12, 0, 20);
    newImageManipulator.drawSubImg(skinImageManipulator, 4, 16, 8, 4, 4, 16);
    newImageManipulator.drawSubImg(skinImageManipulator, 20, 16, 16, 4, 20, 16);
    newImageManipulator.drawSubImg(skinImageManipulator, 44, 16, 8, 4, 44, 16);

    // left arm/leg
    newImageManipulator.drawSubImageFlipped(skinImageManipulator, 8, 16, 4, 4, 24, 48);
    newImageManipulator.drawSubImageFlipped(skinImageManipulator, 4, 16, 4, 4, 20, 48);
    newImageManipulator.drawSubImageFlipped(skinImageManipulator, 44, 16, 4, 4, 36, 48);
    newImageManipulator.drawSubImageFlipped(skinImageManipulator, 48, 16, 4, 4, 40, 48);
    newImageManipulator.drawSubImageFlipped(skinImageManipulator, 4, 20, 4, 12, 20, 52);
    newImageManipulator.drawSubImageFlipped(skinImageManipulator, 8, 20, 4, 12, 16, 52);
    newImageManipulator.drawSubImageFlipped(skinImageManipulator, 12, 20, 4, 12, 28, 52);
    newImageManipulator.drawSubImageFlipped(skinImageManipulator, 0, 20, 4, 12, 24, 52);

    newImageManipulator.drawSubImageFlipped(skinImageManipulator, 44, 20, 4, 12, 36, 52);
    newImageManipulator.drawSubImageFlipped(skinImageManipulator, 48, 20, 4, 12, 32, 52);
    newImageManipulator.drawSubImageFlipped(skinImageManipulator, 52, 20, 4, 12, 44, 52);
    newImageManipulator.drawSubImageFlipped(skinImageManipulator, 40, 20, 4, 12, 40, 52);

    return newImageManipulator;
  }

  private removeUnusedSkinParts(skinImageManipulator: SkinImageManipulator): void {
    const noColor: Color = { r: 0, g: 0, b: 0, alpha: 0 };

    skinImageManipulator.drawRect(0, 0, 8, 8, noColor);
    skinImageManipulator.drawRect(24, 0, 16, 8, noColor);
    skinImageManipulator.drawRect(56, 0, 8, 8, noColor);
    skinImageManipulator.drawRect(0, 16, 4, 4, noColor);
    skinImageManipulator.drawRect(12, 16, 8, 4, noColor);
    skinImageManipulator.drawRect(36, 16, 8, 4, noColor);
    skinImageManipulator.drawRect(56, 16, 8, 16, noColor);
    skinImageManipulator.drawRect(52, 16, 4, 4, noColor);

    skinImageManipulator.drawRect(0, 32, 4, 4, noColor);
    skinImageManipulator.drawRect(0, 48, 4, 4, noColor);
    skinImageManipulator.drawRect(12, 32, 8, 4, noColor);
    skinImageManipulator.drawRect(12, 48, 8, 4, noColor);
    skinImageManipulator.drawRect(28, 48, 8, 4, noColor);
    skinImageManipulator.drawRect(36, 32, 8, 4, noColor);
    skinImageManipulator.drawRect(44, 48, 8, 4, noColor);
    skinImageManipulator.drawRect(52, 32, 4, 4, noColor);
    skinImageManipulator.drawRect(60, 48, 4, 4, noColor);
    skinImageManipulator.drawRect(56, 32, 8, 16, noColor);

    this.removeColorInformationForInvisiblePixels(skinImageManipulator);
  }

  private removeColorInformationForInvisiblePixels(skinImageManipulator: SkinImageManipulator): void {
    for (let x = 0; x < skinImageManipulator.width; ++x) {
      for (let y = 0; y < skinImageManipulator.height; ++y) {
        const color = skinImageManipulator.getColor(x, y);

        if (color.alpha === 0 && (color.r !== 0 || color.g !== 0 || color.b !== 0)) {
          skinImageManipulator.setColor(x, y, { r: 0, g: 0, b: 0, alpha: 0 });
        }
      }
    }
  }

  private correctAlphaForFirstSkinLayer(skinImageManipulator: SkinImageManipulator): void {
    const black: Color = { r: 0, g: 0, b: 0, alpha: 255 };

    for (const area of MinecraftSkinNormalizer.FIRST_SKIN_LAYER_AREAS) {
      for (let i = 0; i < area.w; ++i) {
        for (let j = 0; j < area.h; ++j) {
          const x = area.x + i;
          const y = area.y + j;
          const color = skinImageManipulator.getColor(x, y);
          skinImageManipulator.setColor(x, y, color.alpha > 0 ? { ...color, alpha: 255 } : black);
        }
      }
    }
  }
}
