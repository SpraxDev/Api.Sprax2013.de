import Sharp from 'sharp';
import ImageManipulator from '../../image/ImageManipulator.js';

export default class SkinImageManipulator extends ImageManipulator {
  protected constructor(pixelData: Buffer, imageInfo: Sharp.OutputInfo) {
    super(pixelData, imageInfo);
    if (!this.hasValidSkinDimensions()) {
      throw new Error('Image does not have valid skin dimensions');
    }
  }

  private hasValidSkinDimensions(): boolean {
    return this.width === 64 && (this.height === 64 || this.height === 32);
  }

  static async createByImage(image: Buffer): Promise<SkinImageManipulator> {
    const rawImage = await Sharp(image)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    return new SkinImageManipulator(rawImage.data, rawImage.info);
  }

  static async createEmpty(): Promise<SkinImageManipulator> {
    const rawImage = await Sharp({
      create: {
        channels: 4,
        height: 64,
        width: 64,
        background: {
          r: 0,
          g: 0,
          b: 0,
          alpha: 0
        }
      }
    })
      .raw()
      .toBuffer({ resolveWithObject: true });
    return new SkinImageManipulator(rawImage.data, rawImage.info);
  }
}
