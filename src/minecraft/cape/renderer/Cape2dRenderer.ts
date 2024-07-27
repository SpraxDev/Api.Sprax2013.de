import { singleton } from 'tsyringe';
import ImageManipulator from '../../image/ImageManipulator.js';
import { CapeType } from '../CapeType.js';

@singleton()
export default class Cape2dRenderer {
  async renderCape(image: Buffer, type: CapeType): Promise<ImageManipulator> {
    const capeImg = await ImageManipulator.createByImage(image);
    const renderedCape = await ImageManipulator.createEmpty(...this.getDimensionsForType(type, capeImg));

    this.drawCapeFront(type, capeImg, renderedCape);

    return renderedCape;
  }

  private drawCapeFront(capeType: CapeType, capeImg: ImageManipulator, renderedCape: ImageManipulator): void {
    switch (capeType) {
      case CapeType.MOJANG:
        renderedCape.drawSubImg(capeImg, 1, 1, 10, 16, 0, 0);
        break;

      case CapeType.OPTIFINE:
        if (capeImg.width == 46 && capeImg.height == 22) {
          renderedCape.drawSubImg(capeImg, 1, 1, 10, 16, 0, 0);
        } else if (capeImg.width == 92 && capeImg.height == 44) {
          renderedCape.drawSubImg(capeImg, 2, 2, 20, 32, 0, 0);
        } else {
          throw new Error('Cannot render OptiFine-Cape: Unknown/Unsupported dimensions');
        }
        break;

      case CapeType.LABYMOD:
        throw new Error(`Rendering LabyMod-Capes is currently not supported`);
    }
  }

  private getDimensionsForType(type: CapeType, capeImg: ImageManipulator): [number, number] {
    switch (type) {
      case CapeType.MOJANG:
        return [10, 16];

      case CapeType.OPTIFINE:
        if (capeImg.width == 46 && capeImg.height == 22) {
          return [10, 16];
        } else if (capeImg.width == 92 && capeImg.height == 44) {
          return [20, 32];
        } else {
          throw new Error('Cannot render OptiFine-Cape: Unknown/Unsupported dimensions');
        }

      case CapeType.LABYMOD:
        throw new Error(`Rendering LabyMod-Capes is currently not supported`);
    }
  }
}
