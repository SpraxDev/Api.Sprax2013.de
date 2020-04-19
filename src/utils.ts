import crypto = require('crypto');
import request = require('request');
import sharp = require('sharp');

import { EOL } from 'os';
import { Request, Response } from 'express';

import { Color } from './global';
import { errorLogStream, cfg, appVersion } from '.';

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

  static empty(width: number, height: number, callback: (err: Error | null, img: Image | null) => void, background: { r: number, g: number, b: number, alpha: number } = { r: 0, g: 0, b: 0, alpha: 0 }): void {
    sharp({
      create: {
        background,
        channels: 4,
        width,
        height
      }
    }).raw()
      .toBuffer({ resolveWithObject: true })
      .then((res) => callback(null, new Image(res)))
      .catch((err) => callback(err, null));
  }

  static fromRaw(rgba: Buffer, width: number, height: number, channels: 1 | 2 | 3 | 4, callback: (err?: Error, img?: Image) => void): void {
    const result = sharp(rgba, { raw: { width, height, channels } })
      .ensureAlpha();

    result.toBuffer({ resolveWithObject: true })
      .then((res) => callback(undefined, new Image(res)))
      .catch((err) => callback(err));
  }

  static fromImg(img: string | Buffer, callback: (err: Error | null, rawImg: Image | null) => void, width?: number, height?: number): void {
    const result = sharp(img)
      .ensureAlpha()
      .raw();

    if (width && height) {
      result.resize(width, height, { kernel: 'nearest', fit: 'outside' });
    }

    result.toBuffer({ resolveWithObject: true })
      .then((res) => callback(null, new Image(res)))
      .catch((err) => callback(err, null));
  }

  toPngBuffer(callback: (err: Error | null, png: Buffer | null) => void, width?: number, height?: number): void {
    const result = sharp(this.img.data, {
      raw: {
        channels: 4,
        width: this.img.info.width,
        height: this.img.info.height
      }
    }).png();

    if (width || height) {
      result.resize(width || this.img.info.width, height || this.img.info.height, { kernel: 'nearest', fit: 'outside' });
    }

    result.toBuffer((err, buffer, _info) => callback(err, buffer));
  }

  resize(width: number, height: number, callback: (err: Error | null, png: Image | null) => void): void {
    if (this.img.info.width == width && this.img.info.height == height) return callback(null, this);

    sharp(this.img.data, {
      raw: {
        channels: 4,
        width: this.img.info.width,
        height: this.img.info.height
      }
    })
      .resize(width, height, { kernel: 'nearest', fit: 'outside' })

      .raw()
      .toBuffer({ resolveWithObject: true })

      .then((res) => callback(null, new Image(res)))
      .catch((err) => callback(err, null));
  }

  getColor(x: number, y: number): Color {
    if (x < 0 || y < 0) throw new Error('coordinates cannot be negative');
    if (x >= this.img.info.width || y >= this.img.info.height) throw new Error(`coordinates(x=${x}, y=${y}) are out of bounds(width=${this.img.info.width}, height=${this.img.info.height})`);

    return {
      r: this.img.data[(x * 4) + (y * (this.img.info.width * 4))],
      g: this.img.data[(x * 4) + (y * (this.img.info.width * 4)) + 1],
      b: this.img.data[(x * 4) + (y * (this.img.info.width * 4)) + 2],
      alpha: this.img.data[(x * 4) + (y * (this.img.info.width * 4)) + 3]
    }
  }

  setColor(x: number, y: number, color: Color): void {
    if (x < 0 || y < 0) throw new Error('coordinates cannot be negative');
    if (x >= this.img.info.width || y >= this.img.info.height) throw new Error(`coordinates(x=${x}, y=${y}) are out of bounds(width=${this.img.info.width}, height=${this.img.info.height})`);

    this.img.data[(x * 4) + (y * (this.img.info.width * 4))] = color.r;
    this.img.data[(x * 4) + (y * (this.img.info.width * 4)) + 1] = color.g;
    this.img.data[(x * 4) + (y * (this.img.info.width * 4)) + 2] = color.b;
    this.img.data[(x * 4) + (y * (this.img.info.width * 4)) + 3] = color.alpha;
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

        const color: Color = imgToDraw.getColor(subX + i, subY + j);
        if (newTargetX <= this.img.info.width && newTargetY <= this.img.info.height && color.alpha > 0) {
          this.setColor(newTargetX, newTargetY, color);
        }
      }
    }
  }

  /**
   * @author NudelErde (https://github.com/NudelErde/)
   */
  drawSubImgFlipped(imgToDraw: Image, originX: number, originY: number, width: number, height: number, targetX: number, targetY: number): void {
    for (let i = 0; i < width; i++) {
      for (let j = 0; j < height; j++) {
        const newX = targetX + width - i - 1,
          newY = targetY + j;

        const color = imgToDraw.getColor(originX + i, originY + j);
        if (newX <= this.img.info.width && newY <= this.img.info.height && color.alpha > 0) {
          this.setColor(newX, newY, color);
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

  trimTransparency(callback: (err?: Error, newImage?: Image) => void) {
    let startingX = 0, endingX = this.img.info.width,
      startingY = 0, endingY = this.img.info.height;

    // Top
    for (let y = 0; y < this.img.info.height; y++) {
      let rowIsTransparent = true;

      for (let x = 0; x < this.img.info.width; x++) {
        if (this.getColor(x, y).alpha != 0) {
          rowIsTransparent = false;
          break;
        }
      }

      if (!rowIsTransparent) {
        startingY = y;
        break;
      }
    }

    // Right
    for (let x = this.img.info.width - 1; x >= 0; x--) {
      let colIsTransparent = true;

      for (let y = startingY; y < this.img.info.height; y++) {
        if (this.getColor(x, y).alpha != 0) {
          colIsTransparent = false;
          break;
        }
      }

      if (!colIsTransparent) {
        endingX = x;
        break;
      }
    }

    // Bottom
    for (let y = this.img.info.height - 1; y >= 0; y--) {
      let rowIsTransparent = true;

      for (let x = startingX; x < this.img.info.width; x++) {
        if (this.getColor(x, y).alpha != 0) {
          rowIsTransparent = false;
          break;
        }
      }

      if (!rowIsTransparent) {
        endingY = y;
        break;
      }
    }

    // Left
    for (let x = startingX; x < this.img.info.width; x++) {
      let colIsTransparent = true;

      for (let y = startingY; y < this.img.info.height; y++) {
        if (this.getColor(x, y).alpha != 0) {
          colIsTransparent = false;
          break;
        }
      }

      if (!colIsTransparent) {
        startingX = x;
        break;
      }
    }

    Image.empty(endingX - startingX, endingY - startingY, (err, img) => {
      if (err || !img) return callback(err || new Error());

      img.drawSubImg(this, startingX, startingY, endingX - startingX, endingY - startingY, 0, 0);
      return callback(undefined, img);
    });
  }

  /* Skin */

  /**
   * Upgrades the skin to 64x64px and remove unused parts
   *
   * Creates an png Buffer to use
   */
  toCleanSkinBuffer(callback: (err: Error | null, png: Buffer | null) => void): void {
    this.toCleanSkin((err) => {
      if (err) return callback(err, null);

      this.toPngBuffer((err, png) => {
        if (err) return callback(err, null);

        callback(null, png);
      });
    });
  }

  /**
   * Upgrades the skin to 64x64px and remove unused parts
   */
  toCleanSkin(callback: (err: Error | null) => void): void {
    this.upgradeSkin((err) => {
      if (err) return callback(err);

      this.removeUnusedSkinParts();

      callback(null);
    });
  }

  hasSkinDimensions(): boolean {
    return this.img.info.width == 64 && (this.img.info.height == 64 || this.img.info.height == 32);
  }

  isSlimSkinModel(): boolean {
    return this.getColor(55, 20).alpha == 0;
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

    const color: Color = { r: 0, g: 0, b: 0, alpha: 0 };

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

  static discordHookCounter: number = 0;

  constructor(message: string, httpCode: number, details?: { param: string, condition: string }[], logged?: boolean) {
    super(message);

    this.httpCode = httpCode;
    this.details = details;
    this.logged = logged || false;
  }

  static fromError(err: Error): ApiError {
    return new ErrorBuilder().log(err.message, err.stack).unknown();
  }

  static async log(msg: string, obj?: any, skipWebHook: boolean = false) {
    const stack = new Error().stack;

    console.error('An error occurred:', msg, typeof obj != 'undefined' ? obj : '', process.env.NODE_ENV != 'production' ? stack : '');

    if (errorLogStream) {
      errorLogStream.write(`[${new Date().toUTCString()}] ${JSON.stringify({ msg, obj, stack })}` + EOL);
    }

    // Contact Discord-WebHook
    if (!skipWebHook && ApiError.discordHookCounter < 8 && cfg && cfg.logging.discordErrorWebHookURL && cfg.logging.discordErrorWebHookURL.toLowerCase().startsWith('http')) {
      ApiError.discordHookCounter++;

      request.post(cfg.logging.discordErrorWebHookURL, {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': `SpraxAPI/${appVersion}`,
          Accept: 'application/json'
        },
        body: JSON.stringify({
          username: 'SpraxAPI (Error-Reporter)',
          avatar_url: 'https://cdn.discordapp.com/attachments/611940958568841227/684083067073200138/SpraxAPI-4096px.png',
          embeds: [
            {
              title: 'An error occurred',
              fields: [
                {
                  name: 'Message',
                  value: msg
                },
                {
                  name: 'Object',
                  value: obj != undefined ? '```JS\n' + JSON.stringify(obj, null, 2) + '\n```' : 'Empty'
                }
              ]
            }
          ]
        })
      }, (err: Error, res, body) => {
        if (err) return ApiError.log('Could not execute Discord-WebHook', { msg: err.message }, true);
        if (res.statusCode != 204) return ApiError.log(`Could not execute Discord-WebHook: ${body}`, undefined, true);
      });
    }
  }
}
setInterval(() => ApiError.discordHookCounter = 0, 60 * 1000);

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

  serviceUnavailable(description: string = 'Service Unavailable', adminLog?: string | boolean): ApiError {
    if (adminLog) {
      this.log(typeof adminLog == 'boolean' ? `This should not have happened: ${description}` : adminLog);
    }

    return new ApiError(`${description}`, 503, undefined, this.logged);
  }

  invalidParams(paramType: 'url' | 'query', params: { param: string, condition: string }[]): ApiError {
    return new ApiError(`Missing or invalid ${paramType} parameters`, 400, params, this.logged);
  }

  invalidBody(expected: { param: string, condition: string }[]): ApiError {
    return new ApiError(`Missing or invalid body`, 400, expected, this.logged);
  }
}

export class HttpError {
  static getName(httpCode: number): string | null {
    /* 100s */
    if (httpCode == 100) return 'Continue';
    if (httpCode == 101) return 'Switching Protocols';
    if (httpCode == 102) return 'Processing';

    /* 200s */
    if (httpCode == 200) return 'OK';
    if (httpCode == 201) return 'Created';
    if (httpCode == 202) return 'Accepted';
    if (httpCode == 203) return 'Non-Authoritative Information';
    if (httpCode == 204) return 'No Content';
    if (httpCode == 205) return 'Reset Content';
    if (httpCode == 206) return 'Partial Content';
    if (httpCode == 207) return 'Multi-Status';

    /* 300s */
    if (httpCode == 300) return 'Multiple Choices';
    if (httpCode == 301) return 'Moved Permanently';
    if (httpCode == 302) return 'Found (Moved Temporarily)';
    if (httpCode == 303) return 'See Other';
    if (httpCode == 304) return 'Not Modified';
    if (httpCode == 305) return 'Use Proxy';
    if (httpCode == 307) return 'Temporary Redirect';
    if (httpCode == 308) return 'Permanent Redirect';

    /* 400s */
    if (httpCode == 400) return 'Bad Request';
    if (httpCode == 401) return 'Unauthorized';
    if (httpCode == 402) return 'Payment Required';
    if (httpCode == 403) return 'Forbidden';
    if (httpCode == 404) return 'Not Found';
    if (httpCode == 405) return 'Method Not Allowed';
    if (httpCode == 406) return 'Not Acceptable';
    if (httpCode == 407) return 'Proxy Authentication Required';
    if (httpCode == 408) return 'Request Timeout';
    if (httpCode == 409) return 'Conflict';
    if (httpCode == 410) return 'Gone';
    if (httpCode == 411) return 'Length Required';
    if (httpCode == 412) return 'Precondition Failed';
    if (httpCode == 413) return 'Request Entity Too Large';
    if (httpCode == 414) return 'URI Too Long';
    if (httpCode == 415) return 'Unsupported Media Type';
    if (httpCode == 416) return 'Requested range not satisfiable';
    if (httpCode == 417) return 'Expectation Failed';
    if (httpCode == 420) return 'Policy Not Fulfilled';
    if (httpCode == 421) return 'Misdirected Request';
    if (httpCode == 422) return 'Unprocessable Entity';
    if (httpCode == 423) return 'Locked';
    if (httpCode == 424) return 'Failed Dependency';
    if (httpCode == 426) return 'Upgrade Required';
    if (httpCode == 428) return 'Precondition Required';
    if (httpCode == 429) return 'Too Many Requests';
    if (httpCode == 431) return 'Request Header Fields Too Large';
    if (httpCode == 451) return 'Unavailable For Legal Reasons';

    /* 500s */
    if (httpCode == 500) return 'Internal Server Error';
    if (httpCode == 501) return 'Not Implemented';
    if (httpCode == 502) return 'Bad Gateway';
    if (httpCode == 503) return 'Service Unavailable';
    if (httpCode == 504) return 'Gateway Timeout';
    if (httpCode == 505) return 'HTTP Version not supported';
    if (httpCode == 506) return 'Variant Also Negotiates';
    if (httpCode == 507) return 'Insufficient Storage';
    if (httpCode == 508) return 'Loop Detected';

    return null;
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

export function setCaching(res: Response, cacheResource: boolean = true, publicResource: boolean = true, duration?: number, proxyDuration?: number | undefined): Response {
  let value = '';

  if (cacheResource) {
    value += publicResource ? 'public' : 'private';

    if (duration) {
      value += `, max-age=${duration}`;
    }

    if (proxyDuration) {
      value += `, s-maxage=${proxyDuration}`;
    } else if (typeof duration == 'number') {
      value += `, s-maxage=${duration}`;
    }
  } else {
    value = 'no-cache, no-store, must-revalidate';
  }

  return res.set('Cache-Control', value);
}

export function isUUID(str: string): boolean {
  if (typeof str !== 'string') return false;

  str = str.toLowerCase();

  return str.length >= 32 && str.length <= 36 && (UUID_PATTERN.test(str) || UUID_PATTERN.test(str.replace(/-/g, '').replace(UUID_PATTERN_ADD_DASH, '$1-$2-$3-$4-$5')));
}

export function addHyphensToUUID(str: string): string {
  return str.replace(/-/g, '').replace(UUID_PATTERN_ADD_DASH, '$1-$2-$3-$4-$5');
}

/**
 * Only looks for http(s) protocol
 */
export function isHttpURL(str: string): boolean {
  return /^(http|https):\/\/[^]+$/.test(str.toLowerCase());
}

export function getFileNameFromURL(str: string, stripFileExtension: boolean = false): string {
  const url = new URL(str);

  let fileName = url.pathname.substring(url.pathname.lastIndexOf('/') + 1);

  if (stripFileExtension) {
    const i = fileName.lastIndexOf('.');

    if (i != -1) {
      return fileName.substring(0, i);
    }
  }

  return fileName;
}

/**
 * Checks if string only contains numbers (negative numbers are not allowed)
 */
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

export function toInt(input: string | number | boolean): number | null {
  if (input) {
    if (typeof input == 'number') return input;
    if (typeof input == 'string' && isNumber(input)) return parseInt(input);
  }

  return null;
}

/**
 * Defaults to 'sha256' algorithm
 */
export function generateHash(data: Buffer | string, algorithm: string = 'sha256', options?: crypto.HashOptions): string {
  if (!(data instanceof Buffer)) {
    data = Buffer.from(data);
  }

  return crypto.createHash(algorithm, options).update(data).digest('hex');
}