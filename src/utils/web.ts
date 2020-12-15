import { type as osType } from 'os';
import {
  get as saGet,
  parse as agentParsers,
  post as saPost,
  Response as saResponse,
  SuperAgentRequest
} from 'superagent';

import { appVersion } from '..';

// let lastProxy = 0;
// let proxies: { proxy: string, jar: CookieJar }[] | null = null;

// export async function getHttp(uri: string, useProxy: boolean = true, triesLeft: number = 3): Promise<{ res: Response, body: Buffer }> {
//   return new Promise((resolve, reject) => {
//     get(uri, getRequestOptions(useProxy), (err, httpRes, httpBody: Buffer) => {
//       if (err || httpRes.statusCode == 429 || httpRes.statusCode == 500 ||
//           httpRes.statusCode == 503 || httpRes.statusCode == 504) {
//         if (triesLeft > 0) {
//           // ApiError.log('Retrying with another proxy...', { uri, triesLeft }, true);  // Might result in console spam
//           return getHttp(uri, useProxy, --triesLeft) // Retry with another proxy
//               .then(resolve)
//               .catch(reject);
//         } else if (triesLeft == 0 && useProxy) {
//           return getHttp(uri, false, --triesLeft) // One last try without proxy pool (my proxies are sometimes down for a couple of hours >:( - Patrons can help me with that c:)
//               .then(resolve)
//               .catch(reject);
//         }
//
//         return reject(err || new Error(`Outgoing request failed: ${uri}`));
//       }
//
//       return resolve({res: httpRes, body: httpBody});
//     });
//   });
// }

// export function getRequestOptions(useProxy: boolean): CoreOptions {
//   return Object.assign(useProxy ? getNextProxy() : {}, {encoding: null});
// }

// function getNextProxy(): { proxy: string, jar: CookieJar } {
//   if (getProxies().length == 0) return getProxies()[0];
//   if (lastProxy >= getProxies().length) lastProxy = 0;
//
//   return getProxies()[lastProxy++];
// }

// function getProxies(): { proxy: string, jar: CookieJar }[] {
//   if (proxies == null) {
//     proxies = cfg.proxies.length == 0 ?
//         [{proxy: '', jar: jar()}] :
//         cfg.proxies.map((val) => {
//           return {proxy: val.length > 0 ? `http://${val}` : val, jar: jar(), timeout: 1000};
//         });
//   }
//
//   return proxies;
// }


/**
 * @param url The URL to send the request to
 * @param headers Optional. Headers to send with the request (additionally to the default headers)
 */
export async function httpGet(url: string, headers?: { [key: string]: string }): Promise<{ res: saResponse, body: Buffer }> {
  return new Promise<{ res: saResponse, body: Buffer }>((resolve, reject) => {
    applyDefaults(saGet(url), headers)
        .end(getReqHandler(resolve, reject));
  });
}

/**
 * @param url The URL to send the request to
 * @param headers Optional. Headers to send with the request (additionally to the default headers)
 * @param body Optional. The request body to send
 */
export async function httpPost(url: string, headers?: { [key: string]: string }, body?: string | object): Promise<{ res: saResponse, body: Buffer }> {
  return new Promise<{ res: saResponse, body: Buffer }>((resolve, reject) => {
    applyDefaults(saPost(url), headers, body)
        .end(getReqHandler(resolve, reject));
  });
}

export function applyDefaults(req: SuperAgentRequest, headers?: { [key: string]: string }, body?: string | object): SuperAgentRequest {
  // set own default headers
  req.set('User-Agent', getUserAgent());

  // Set optional headers
  if (headers) {
    for (const header in headers) {
      if (Object.prototype.hasOwnProperty.call(headers, header)) {
        req.set(header, headers[header]);
      }
    }
  }

  // Force the response body to be a Buffer instead of a String
  req.buffer(true)
      .parse(agentParsers['application/octet-stream']);

  // Set optional body
  if (body) {
    req.send(body);
  }

  // Return same req for chaining
  return req;
}

export function getReqHandler(resolve: Function, reject: Function): (err: any, res: saResponse) => void {
  return (err, res) => {
    if (err && !res) return reject(err);  // An error occurred (http errors are excluded! 404 is not an error in my eyes as the request itself was successful)

    return resolve({res, body: res.body});
  };
}

export function getUserAgent(): string {
  return `Sprax-API/${appVersion} (${osType()}; ${process.arch}; ${process.platform}) (+https://Api.Sprax2013.de)`;
}