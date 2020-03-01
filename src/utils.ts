import { Request, Response } from 'express';
import { Color } from './global';
import sharp = require('sharp');
import crypto = require('crypto');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  UUID_PATTERN_ADD_DASH = /(.{8})(.{4})(.{4})(.{4})(.{12})/;

export class Image {
  img: { data: Buffer, info: sharp.OutputInfo };

  /**
   * Use `Image.fromImg`
   */
  constructor(rgbaArr: { data: Buffer, info: sharp.OutputInfo }) {
    this.img = rgbaArr;
  }

  static fromImg(img: string | Buffer, callback: (err: Error | null, rawImg: Image | null) => void): void {
    sharp(img)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })

      .then((res) => callback(null, new Image(res)))
      .catch((err) => callback(err, null));
  }

  toPngBuffer(callback: (err: Error, png: Buffer | null) => void): void {
    sharp(this.img.data, {
      raw: {
        channels: 4,
        width: this.img.info.width,
        height: this.img.info.height
      }
    }).png()
      .toBuffer((err, buffer, _info) => callback(err, buffer));
  }

  getColor(x: number, y: number): Color {
    return {
      r: this.img.data[(x * 4) + (y * (this.img.info.width * 4))],
      g: this.img.data[(x * 4) + (y * (this.img.info.width * 4)) + 1],
      b: this.img.data[(x * 4) + (y * (this.img.info.width * 4)) + 2],
      a: this.img.data[(x * 4) + (y * (this.img.info.width * 4)) + 3]
    }
  }

  setColor(x: number, y: number, color: Color): void {
    this.img.data[(x * 4) + (y * (this.img.info.width * 4))] = color.r;
    this.img.data[(x * 4) + (y * (this.img.info.width * 4)) + 1] = color.g;
    this.img.data[(x * 4) + (y * (this.img.info.width * 4)) + 2] = color.b;
    this.img.data[(x * 4) + (y * (this.img.info.width * 4)) + 3] = color.a;
  }

  drawImg(imgToDraw: Image, x: number, y: number): void {
    for (let i = 0; i < imgToDraw.img.info.width; i++) {
      for (let j = 0; j < imgToDraw.img.info.height; j++) {
        const targetX = x + i,
          targetY = y + j;

        if (targetX <= this.img.info.width && targetY <= this.img.info.height) {
          this.setColor(targetX, targetY, imgToDraw.getColor(i, j));
        }
      }
    }
  }

  drawSubImg(imgToDraw: Image, subX: number, subY: number, width: number, height: number, targetX: number, targetY: number): void {
    for (let i = 0; i < width; i++) {
      for (let j = 0; j < height; j++) {
        const newTargetX = targetX + i,
          newTargetY = targetY + j;

        if (newTargetX <= this.img.info.width && newTargetY <= this.img.info.height) {
          this.setColor(newTargetX, newTargetY, imgToDraw.getColor(subX + i, subY + j));
        }
      }
    }
  }

  drawSubImgFlipped(imgToDraw: Image, originX: number, originY: number, width: number, height: number, targetX: number, targetY: number): void {
    for (let i = 0; i < width; i++) {
      for (let j = 0; j < height; j++) {
        const newX = targetX + width - i - 1,
          newY = targetY + j;

        if (newX <= this.img.info.width && newY <= this.img.info.height) {
          this.setColor(newX, newY, imgToDraw.getColor(originX + i, originY + j));
        }
      }
    }
  }

  drawRect(x: number, y: number, width: number, height: number, color: Color): void {
    for (let i = 0; i < width; i++) {
      for (let j = 0; j < height; j++) {
        this.setColor(x + i, y + j, color);
      }
    }
  }

  /* Skin */

  /**
   * Upgrades the skin to 64x64px and remove unused parts
   *
   * Creates an png Buffer to use
   */
  toCleanSkin(callback: (err: Error | null, png: Buffer | null) => void): void {
    this.upgradeSkin((err) => {
      if (err) return callback(err, null);

      this.removeUnusedSkinParts();

      this.toPngBuffer((err, png) => {
        if (err) return callback(err, null);

        callback(null, png);
      });
    });
  }

  hasSkinDimensions(): boolean {
    return this.img.info.width == 64 && (this.img.info.height == 64 || this.img.info.height == 32);
  }

  upgradeSkin(callback: (err: Error | null) => void): void {
    if (!this.hasSkinDimensions()) throw new Error('Image does not have valid skin dimensions');
    if (this.img.info.height != 32) return callback(null);

    sharp({
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
      .toBuffer({ resolveWithObject: true })

      .then((res) => {
        const newImg: Image = new Image(res);

        newImg.drawImg(this, 0, 0);

        newImg.drawSubImgFlipped(this, 8, 16, 4, 4, 24, 48);
        newImg.drawSubImgFlipped(this, 4, 16, 4, 4, 20, 48);
        newImg.drawSubImgFlipped(this, 44, 16, 4, 4, 36, 48);
        newImg.drawSubImgFlipped(this, 48, 16, 4, 4, 40, 48);
        newImg.drawSubImgFlipped(this, 4, 20, 4, 12, 20, 52);
        newImg.drawSubImgFlipped(this, 8, 20, 4, 12, 16, 52);
        newImg.drawSubImgFlipped(this, 12, 20, 4, 12, 28, 52);
        newImg.drawSubImgFlipped(this, 0, 20, 4, 12, 24, 52);

        newImg.drawSubImgFlipped(this, 44, 20, 4, 12, 36, 52);
        newImg.drawSubImgFlipped(this, 48, 20, 4, 12, 32, 52);
        newImg.drawSubImgFlipped(this, 52, 20, 4, 12, 44, 52);
        newImg.drawSubImgFlipped(this, 40, 20, 4, 12, 40, 52);

        this.img = newImg.img;
        callback(null);
      })
      .catch((err) => callback(err));
  }

  removeUnusedSkinParts() {
    if (!this.hasSkinDimensions()) throw new Error('Image does not have valid skin dimensions');
    if (this.img.info.height != 64) throw new Error('Legacy skin dimensions are not supported');

    const color: Color = { r: 0, g: 0, b: 0, a: 0 };

    this.drawRect(0, 0, 8, 8, color);
    this.drawRect(24, 0, 16, 8, color);
    this.drawRect(56, 0, 8, 8, color);
    this.drawRect(0, 16, 4, 4, color);
    this.drawRect(12, 16, 8, 4, color);
    this.drawRect(36, 16, 8, 4, color);
    this.drawRect(56, 16, 8, 16, color);
    this.drawRect(52, 16, 4, 4, color);

    this.drawRect(0, 32, 4, 4, color);
    this.drawRect(0, 48, 4, 4, color);
    this.drawRect(12, 32, 8, 4, color);
    this.drawRect(12, 48, 8, 4, color);
    this.drawRect(28, 48, 8, 4, color);
    this.drawRect(36, 32, 8, 4, color);
    this.drawRect(44, 48, 8, 4, color);
    this.drawRect(52, 32, 4, 4, color);
    this.drawRect(60, 48, 4, 4, color);
    this.drawRect(56, 32, 8, 16, color);
  }
}

/**
 * This shortcut function responses with HTTP 405 to the requests having
 * a method that does not have corresponding request handler.
 *
 * For example if a resource allows only GET and POST requests then
 * PUT, DELETE, etc. requests will be responsed with the 405.
 *
 * HTTP 405 is required to have Allow-header set to a list of allowed
 * methods so in this case the response has "Allow: GET, POST, HEAD" in its headers.
 *
 * Example usage
 *
 *    // A handler that allows only GET (and HEAD) requests and returns
 *    app.all('/path', (req, res, next) => {
 *      restful(req, res, {
 *        get: () => {
 *          res.send('Hello world!');
 *        }
 *      });
 *    });
 *
 * Orignal author: https://stackoverflow.com/a/15754373/9346616
 */
export function restful(req: Request, res: Response, handlers: { [key: string]: () => void }): void {
  const method = (req.method || '').toLowerCase();

  if (method in handlers) {
    handlers[method]();
  } else {
    const allowedMethods: string[] = Object.keys(handlers);
    if ('get' in handlers && !('head' in handlers)) {
      allowedMethods.push('head');
    }

    res.set('Allow', allowedMethods.join(', ').toUpperCase())
      .sendStatus(405); // TODO: send error-custom body
  }
}

export function isUUID(str: string): boolean {
  if (typeof str !== 'string') return false;

  str = str.toLowerCase();

  return str.length >= 32 && str.length <= 36 && (UUID_PATTERN.test(str) || UUID_PATTERN.test(str.replace(/-/g, '').replace(UUID_PATTERN_ADD_DASH, '$1-$2-$3-$4-$5')));
}

export function addHyphensToUUID(str: string): string {
  return str.replace(/-/g, '').replace(UUID_PATTERN_ADD_DASH, '$1-$2-$3-$4-$5');
}

export function isNumber(str: string): boolean {
  if (typeof str == 'number') return !Number.isNaN(str) && Number.isFinite(str);
  if (typeof str != 'string') return false;

  return /^[0-9]+$/.test(str);
}

export function toBoolean(input: string | number | boolean): boolean {
  if (input) {
    if (typeof input == 'string') return input == '1' || input.toLowerCase() == 'true' || input.toLowerCase() == 't';
    if (typeof input == 'number') return input == 1;
    if (typeof input == 'boolean') return input;
  }

  return false;
}

/**
 * sha256
 */
export function generateHash(data: Buffer, algorithm?: string, options?: crypto.HashOptions): string {
  return crypto.createHash(algorithm || 'sha256', options).update(data).digest('hex');
}