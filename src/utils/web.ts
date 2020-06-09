import { jar, CookieJar, CoreOptions, get, Response } from 'request';
import { cfg } from '..';
import { ApiError } from './utils';

let lastProxy = 0;
const proxies: { proxy: string, jar: CookieJar }[] =
  cfg.proxies.length == 0 ?
    [{ proxy: '', jar: jar() }] :
    cfg.proxies.map((val) => { return { proxy: val.length > 0 ? `http://${val}` : val, jar: jar() } });

export async function getHttp(uri: string, triesLeft: number = 3): Promise<{ res: Response, body: Buffer }> {
  return new Promise((resolve, reject) => {
    get(uri, getRequestOptions(), (err, httpRes, httpBody: Buffer) => {
      if (err) {
        if (triesLeft > 0) {
          if (err.code == 'ETIMEDOUT' || err.code == 'ECONNREFUSED' ||
            httpRes.statusCode == 429 || httpRes.statusCode == 500 ||
            httpRes.statusCode == 503 || httpRes.statusCode == 504) {
            ApiError.log('Retrying with another proxy...', { uri, triesLeft });
            return getHttp(uri, --triesLeft); // Retry with another proxy
          }
        }

        return reject(err);
      }

      return resolve({ res: httpRes, body: httpBody });
    });
  });
}

export function getRequestOptions(): CoreOptions {
  return Object.assign(getNextProxy(), { encoding: null });
}

function getNextProxy(): { proxy: string, jar: CookieJar } {
  if (proxies.length == 0) return proxies[0];
  if (lastProxy >= proxies.length) lastProxy = 0;

  return proxies[lastProxy++];
}