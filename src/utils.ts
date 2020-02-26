import { Request, Response } from "express";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  UUID_PATTERN_ADD_DASH = /(.{8})(.{4})(.{4})(.{4})(.{12})/;

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