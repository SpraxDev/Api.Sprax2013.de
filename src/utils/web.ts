import { jar, CookieJar, CoreOptions, get, Response } from 'request';
import { cfg } from '..';
import { ApiError } from './utils';

let lastProxy = 0;
const proxies: { proxy: string, jar: CookieJar }[] =
  cfg.proxies.length == 0 ?
    [{ proxy: '', jar: jar() }] :
    cfg.proxies.map((val) => { return { proxy: val.length > 0 ? `http://${val}` : val, jar: jar() } });

export async function getHttp(uri: string, useProxy: boolean = true, triesLeft: number = 3): Promise<{ res: Response, body: Buffer }> {
  return new Promise((resolve, reject) => {
    get(uri, getRequestOptions(useProxy), (err, httpRes, httpBody: Buffer) => {
      if (err || httpRes.statusCode == 429 || httpRes.statusCode == 500 ||
        httpRes.statusCode == 503 || httpRes.statusCode == 504) {
        if (!err || err.code == 'ETIMEDOUT' || err.code == 'ECONNREFUSED') {
          if (triesLeft > 0) {
            ApiError.log('Retrying with another proxy...', { uri, triesLeft });
            return getHttp(uri, useProxy, --triesLeft); // Retry with another proxy
          } else if (triesLeft == 0 && useProxy) {
            return getHttp(uri, false, --triesLeft); // One last try without proxy pool (my proxies are sometimes down for a couple of hours >:( - Patreons can help me with that c:)
          }
        }

        return reject(err);
      }

      return resolve({ res: httpRes, body: httpBody });
    });
  });
}

export function getRequestOptions(useProxy: boolean): CoreOptions {
  return Object.assign(useProxy ? getNextProxy() : {}, { encoding: null });
}

function getNextProxy(): { proxy: string, jar: CookieJar } {
  if (proxies.length == 0) return proxies[0];
  if (lastProxy >= proxies.length) lastProxy = 0;

  return proxies[lastProxy++];
}