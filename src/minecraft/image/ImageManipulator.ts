import Sharp from 'sharp';
import XXHashAddon from 'xxhash-addon';

export interface Color {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly alpha: number;
}

export default class ImageManipulator {
  public readonly channels: 1 | 2 | 3 | 4;
  public readonly width: number;
  public readonly height: number;

  constructor(
    protected readonly pixelData: Buffer,
    imageInfo: { width: number, height: number, channels: 1 | 2 | 3 | 4 },
  ) {
    this.channels = imageInfo.channels;
    this.width = imageInfo.width;
    this.height = imageInfo.height;
  }

  protected assertCoordinatesInBounds(x: number, y: number): void {
    if (x < 0 || y < 0) {
      throw new Error(`Image coordinates cannot be negative: (${x}|${y})`);
    }
    if (x >= this.width || y >= this.height) {
      throw new Error(`coordinates(${x}|${y}) are out of bounds(${this.width}|${this.height})`);
    }
  }

  drawRect(x: number, y: number, width: number, height: number, color: Color): void {
    for (let i = 0; i < width; ++i) {
      for (let j = 0; j < height; ++j) {
        this.setColor(x + i, y + j, color);
      }
    }
  }

  drawImage(imageToDraw: ImageManipulator, x: number, y: number): void {
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

  drawSubImg(
    imageToDraw: ImageManipulator,
    subX: number,
    subY: number,
    width: number,
    height: number,
    targetX: number,
    targetY: number,
    ignoreAlpha: boolean = false,
    mode: 'replace' | 'add' = 'replace',
  ): void {
    // Pre-calculate bounds to avoid repeated checks in inner loop
    const maxX = Math.min(targetX + width, this.width);
    const maxY = Math.min(targetY + height, this.height);
    const startX = Math.max(targetX, 0);
    const startY = Math.max(targetY, 0);
    
    // Early exit if no drawing area
    if (startX >= maxX || startY >= maxY) {
      return;
    }

    // For small rectangles, use the optimized method
    if (width <= 8 && height <= 8) {
      return this.drawSubImgOptimized(imageToDraw, subX, subY, width, height, targetX, targetY, ignoreAlpha, mode);
    }

    // Original implementation for larger areas
    for (let i = 0; i < width; ++i) {
      for (let j = 0; j < height; ++j) {
        const newTargetX = targetX + i;
        const newTargetY = targetY + j;

        const color = imageToDraw.getColor(subX + i, subY + j);
        if (newTargetX < this.width && newTargetY < this.height && newTargetX >= 0 && newTargetY >= 0 && color.alpha > 0) {
          let newColor = { r: color.r, g: color.g, b: color.b, alpha: ignoreAlpha ? 255 : color.alpha };
          if (mode == 'add') {
            newColor = ImageManipulator.mergeColors(this.getColor(newTargetX, newTargetY), newColor);
          }

          this.setColor(newTargetX, newTargetY, newColor);
        }
      }
    }
  }

  /**
   * Optimized version for small image operations (8x8 or smaller)
   * Reduces function call overhead for common skin operations
   */
  private drawSubImgOptimized(
    imageToDraw: ImageManipulator,
    subX: number,
    subY: number,
    width: number,
    height: number,
    targetX: number,
    targetY: number,
    ignoreAlpha: boolean,
    mode: 'replace' | 'add',
  ): void {
    const bytesPerPixel = this.channels;
    const targetBytesPerPixel = imageToDraw.channels;
    
    for (let j = 0; j < height; ++j) {
      for (let i = 0; i < width; ++i) {
        const newTargetX = targetX + i;
        const newTargetY = targetY + j;
        
        // Bounds check
        if (newTargetX < 0 || newTargetY < 0 || newTargetX >= this.width || newTargetY >= this.height) {
          continue;
        }

        // Direct buffer access for better performance
        const sourceIndex = ((subY + j) * imageToDraw.width + (subX + i)) * targetBytesPerPixel;
        const targetIndex = (newTargetY * this.width + newTargetX) * bytesPerPixel;
        
        if (sourceIndex >= 0 && sourceIndex + 3 < imageToDraw.pixelData.length) {
          const alpha = imageToDraw.pixelData[sourceIndex + 3];
          
          if (alpha > 0) {
            const r = imageToDraw.pixelData[sourceIndex];
            const g = imageToDraw.pixelData[sourceIndex + 1];
            const b = imageToDraw.pixelData[sourceIndex + 2];
            const finalAlpha = ignoreAlpha ? 255 : alpha;
            
            if (mode === 'add' && targetIndex >= 0 && targetIndex + 3 < this.pixelData.length) {
              // Simple additive blending for performance
              const existingR = this.pixelData[targetIndex];
              const existingG = this.pixelData[targetIndex + 1];
              const existingB = this.pixelData[targetIndex + 2];
              const existingAlpha = this.pixelData[targetIndex + 3];
              
              if (existingAlpha > 0) {
                // Simplified blending for performance
                const factor = finalAlpha / 255;
                this.pixelData[targetIndex] = Math.min(255, existingR + r * factor);
                this.pixelData[targetIndex + 1] = Math.min(255, existingG + g * factor);
                this.pixelData[targetIndex + 2] = Math.min(255, existingB + b * factor);
                this.pixelData[targetIndex + 3] = Math.max(existingAlpha, finalAlpha);
              } else {
                this.pixelData[targetIndex] = r;
                this.pixelData[targetIndex + 1] = g;
                this.pixelData[targetIndex + 2] = b;
                this.pixelData[targetIndex + 3] = finalAlpha;
              }
            } else if (targetIndex >= 0 && targetIndex + 3 < this.pixelData.length) {
              // Direct copy for replace mode
              this.pixelData[targetIndex] = r;
              this.pixelData[targetIndex + 1] = g;
              this.pixelData[targetIndex + 2] = b;
              this.pixelData[targetIndex + 3] = finalAlpha;
            }
          }
        }
      }
    }
  }

  drawSubImageFlipped(
    imageToDraw: ImageManipulator,
    originX: number,
    originY: number,
    width: number,
    height: number,
    targetX: number,
    targetY: number,
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
      alpha: this.pixelData[(x * 4) + (y * (this.width * 4)) + 3],
    };
  }

  setColor(x: number, y: number, color: Color): void {
    this.assertCoordinatesInBounds(x, y);

    this.pixelData[(x * 4) + (y * (this.width * 4))] = color.r;
    this.pixelData[(x * 4) + (y * (this.width * 4)) + 1] = color.g;
    this.pixelData[(x * 4) + (y * (this.width * 4)) + 2] = color.b;
    this.pixelData[(x * 4) + (y * (this.width * 4)) + 3] = color.alpha;
  }

  toPngBuffer(resizeOptions?: { width: number, height: number }): Promise<Buffer> {
    const sharp = this.toSharp();
    if (resizeOptions != null) {
      sharp.resize(resizeOptions.width, resizeOptions.height, { kernel: 'nearest', fit: 'outside' });
    }

    return sharp
      .png()
      .toBuffer();
  }

  async toRaw(): Promise<{ data: Buffer; info: Sharp.OutputInfo }> {
    return this.toSharp().raw().toBuffer({ resolveWithObject: true });
  }

  toSharp(): Sharp.Sharp {
    return Sharp(this.pixelData, {
      raw: {
        channels: this.channels,
        width: this.width,
        height: this.height,
      },
    });
  }

  calculatePixelDataHashXXH128(): Buffer {
    return XXHashAddon.XXHash128.hash(this.pixelData);
  }

  static async createEmpty(width: number, height: number): Promise<ImageManipulator> {
    const rawImage = await Sharp({
      create: {
        channels: 4,
        width,
        height,
        background: {
          r: 0,
          g: 0,
          b: 0,
          alpha: 0,
        },
      },
    })
      .raw()
      .toBuffer({ resolveWithObject: true });
    return new ImageManipulator(rawImage.data, rawImage.info);
  }

  static async createByImage(image: Buffer): Promise<ImageManipulator> {
    const rawImage = await Sharp(image)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    return new ImageManipulator(rawImage.data, rawImage.info);
  }

  /**
   * Combine (additive) two RGBA colors
   */
  static mergeColors(col1: Color, col2: Color): Color {
    const col1Alpha = col1.alpha / 255;
    const col2Alpha = col2.alpha / 255;

    if (col1Alpha <= 0 && col2Alpha <= 0) {
      return { r: 0, g: 0, b: 0, alpha: 0 };
    }
    if (col1Alpha <= 0) {
      return { r: col2.r, g: col2.g, b: col2.b, alpha: col2.alpha };
    }
    if (col2Alpha <= 0) {
      return { r: col1.r, g: col1.g, b: col1.b, alpha: col1.alpha };
    }

    const alpha = 1 - (1 - col2Alpha) * (1 - col1Alpha);
    const r = Math.round((col2.r * col2Alpha / alpha) + (col1.r * col1Alpha * (1 - col2Alpha) / alpha));
    const g = Math.round((col2.g * col2Alpha / alpha) + (col1.g * col1Alpha * (1 - col2Alpha) / alpha));
    const b = Math.round((col2.b * col2Alpha / alpha) + (col1.b * col1Alpha * (1 - col2Alpha) / alpha));

    return { r, g, b, alpha: alpha * 255 };
  }
}
