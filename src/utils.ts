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

export class ApiError extends Error {
  readonly httpCode: number;
  readonly details?: { param: string, condition: string }[];
  logged: boolean;

  constructor(message: string, httpCode: number, details?: { param: string, condition: string }[], logged?: boolean) {
    super(message);

    this.httpCode = httpCode;
    this.details = details;
    this.logged = logged || false;
  }

  static fromError(err: Error): ApiError {
    return new ErrorBuilder().log(err.message, err.stack).unknown();
  }

  static log(msg: string, obj?: any): void {
    console.error(`${msg}${obj ? ` (${JSON.stringify(obj)})` : ''}:`, new Error().stack); // TODO log
  }
}

export class ErrorBuilder {
  logged: boolean = false;

  constructor() { }

  log(msg: string, obj?: any): this {
    ApiError.log(msg, obj);
    this.logged = true;

    return this;
  }

  unknown(): ApiError {
    return new ApiError('An unknown error occurred', 500, undefined, this.logged);
  }

  notFound(whatCouldNotBeFound: string = 'The requested resource could not be found', adminLog?: string | boolean): ApiError {
    if (adminLog) {
      this.log(typeof adminLog == 'boolean' ? `This should not have happened: ${whatCouldNotBeFound}` : adminLog);
    }

    return new ApiError(`${whatCouldNotBeFound}${adminLog ? ' (server-side error)' : ''}`, adminLog ? 500 : 404, undefined, this.logged);
  }

  serverErr(whatFailed: string = 'An error occurred', adminLog?: string | boolean): ApiError {
    if (adminLog) {
      this.log(typeof adminLog == 'boolean' ? `This should not have happened: ${whatFailed}` : adminLog);
    }

    return new ApiError(`${whatFailed}`, 500, undefined, this.logged);
  }

  invalidParams(paramType: 'url' | 'query', params: { param: string, condition: string }[]): ApiError {
    return new ApiError(`Missing or invalid ${paramType} parameters`, 400, params, this.logged);
  }
}

export class HttpError {
  static getName(httpCode: number): string | null {
    switch (httpCode) {
      case 100:
        return 'Continue';
      case 101:
        return 'Switching Protocols';
      case 102:
        return 'Processing';

      case 200:
        return 'OK';
      case 201:
        return 'Created';
      case 202:
        return 'Accepted';
      case 203:
        return 'Non-Authoritative Information';
      case 204:
        return 'No Content';
      case 205:
        return 'Reset Content';
      case 206:
        return 'Partial Content';
      case 207:
        return 'Multi-Status';

      case 300:
        return 'Multiple Choices';
      case 301:
        return 'Moved Permanently';
      case 302:
        return 'Found (Moved Temporarily)';
      case 303:
        return 'See Other';
      case 304:
        return 'Not Modified';
      case 305:
        return 'Use Proxy';
      case 307:
        return 'Temporary Redirect';
      case 308:
        return 'Permanent Redirect';

      case 400:
        return 'Bad Request';
      case 401:
        return 'Unauthorized';
      case 402:
        return 'Payment Required';
      case 403:
        return 'Forbidden';
      case 404:
        return 'Not Found';
      case 405:
        return 'Method Not Allowed';
      case 406:
        return 'Not Acceptable';
      case 407:
        return 'Proxy Authentication Required';
      case 408:
        return 'Request Timeout';
      case 409:
        return 'Conflict';
      case 410:
        return 'Gone';
      case 411:
        return 'Length Required';
      case 412:
        return 'Precondition Failed';
      case 413:
        return 'Request Entity Too Large';
      case 414:
        return 'URI Too Long';
      case 415:
        return 'Unsupported Media Type';
      case 416:
        return 'Requested range not satisfiable';
      case 417:
        return 'Expectation Failed';
      case 420:
        return 'Policy Not Fulfilled';
      case 421:
        return 'Misdirected Request';
      case 422:
        return 'Unprocessable Entity';
      case 423:
        return 'Locked';
      case 424:
        return 'Failed Dependency';
      case 426:
        return 'Upgrade Required';
      case 428:
        return 'Precondition Required';
      case 429:
        return 'Too Many Requests';
      case 431:
        return 'Request Header Fields Too Large';
      case 451:
        return 'Unavailable For Legal Reasons';

      case 500:
        return 'Internal Server Error';
      case 501:
        return 'Not Implemented';
      case 502:
        return 'Bad Gateway';
      case 503:
        return 'Service Unavailable';
      case 504:
        return 'Gateway Timeout';
      case 505:
        return 'HTTP Version not supported';
      case 506:
        return 'Variant Also Negotiates';
      case 507:
        return 'Insufficient Storage';
      case 508:
        return 'Loop Detected';
      default:
        return null;
    }
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
 * Defaults to 'sha256' algorithm
 */
export function generateHash(data: Buffer, algorithm: string = 'sha256', options?: crypto.HashOptions): string {
  return crypto.createHash(algorithm, options).update(data).digest('hex');
}