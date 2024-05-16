import Sharp from 'sharp';

export interface Color {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly alpha: number;
}

export default class SkinImageManipulator {
  public readonly width: number;
  public readonly height: number;

  constructor(
    private readonly pixelData: Buffer,
    private readonly imageInfo: Sharp.OutputInfo
  ) {
    if (!this.hasValidSkinDimensions()) {
      throw new Error('Image does not have valid skin dimensions');
    }
    this.width = imageInfo.width;
    this.height = imageInfo.height;
  }

  drawRect(x: number, y: number, width: number, height: number, color: Color): void {
    for (let i = 0; i < width; ++i) {
      for (let j = 0; j < height; ++j) {
        this.setColor(x + i, y + j, color);
      }
    }
  }

  drawImage(imageToDraw: SkinImageManipulator, x: number, y: number): void {
    for (let i = 0; i < imageToDraw.width; ++i) {
      for (let j = 0; j < imageToDraw.height; ++j) {
        const targetX = x + i;
        const targetY = y + j;

        if (targetX <= this.width && targetY <= this.height) {
          this.setColor(targetX, targetY, imageToDraw.getColor(i, j));
        }
      }
    }
  }

  drawSubImageFlipped(
    imageToDraw: SkinImageManipulator,
    originX: number,
    originY: number,
    width: number,
    height: number,
    targetX: number,
    targetY: number
  ): void {
    for (let i = 0; i < width; ++i) {
      for (let j = 0; j < height; ++j) {
        const newX = targetX + width - i - 1;
        const newY = targetY + j;

        const color = imageToDraw.getColor(originX + i, originY + j);
        if (newX <= this.width && newY <= this.height && color.alpha > 0) {
          this.setColor(newX, newY, color);
        }
      }
    }
  }

  getColor(x: number, y: number): Color {
    this.assertCoordinatesInBounds(x, y);

    return {
      r: this.pixelData[(x * 4) + (y * (this.width * 4))],
      g: this.pixelData[(x * 4) + (y * (this.width * 4)) + 1],
      b: this.pixelData[(x * 4) + (y * (this.width * 4)) + 2],
      alpha: this.pixelData[(x * 4) + (y * (this.width * 4)) + 3]
    };
  }

  setColor(x: number, y: number, color: Color): void {
    this.assertCoordinatesInBounds(x, y);

    this.pixelData[(x * 4) + (y * (this.width * 4))] = color.r;
    this.pixelData[(x * 4) + (y * (this.width * 4)) + 1] = color.g;
    this.pixelData[(x * 4) + (y * (this.width * 4)) + 2] = color.b;
    this.pixelData[(x * 4) + (y * (this.width * 4)) + 3] = color.alpha;
  }

  toPngBuffer(): Promise<Buffer> {
    return Sharp(this.pixelData, {
      raw: {
        channels: 4,
        width: this.width,
        height: this.height
      }
    })
      .png()
      .toBuffer();
  }

  private hasValidSkinDimensions(): boolean {
    return this.imageInfo.width === 64 && (this.imageInfo.height === 64 || this.imageInfo.height === 32);
  }

  private assertCoordinatesInBounds(x: number, y: number): void {
    if (x < 0 || y < 0) {
      throw new Error(`Image coordinates cannot be negative: (${x}|${y})`);
    }
    if (x >= this.width || y >= this.height) {
      throw new Error(`coordinates(${x}|${y}) are out of bounds(${this.width}|${this.height})`);
    }
  }

  static async forImage(image: Buffer): Promise<SkinImageManipulator> {
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
