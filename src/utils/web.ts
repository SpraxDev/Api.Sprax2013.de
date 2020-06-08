import { jar, CookieJar, CoreOptions } from 'request';
import { cfg } from '..';

let lastProxy = 0;
const proxies: { proxy: string, jar: CookieJar }[] =
  cfg.proxies.length == 0 ?
    [{ proxy: '', jar: jar() }] :
    cfg.proxies.map((val) => { return { proxy: val.length > 0 ? `http://${val}` : val, jar: jar() } });

export function getRequestOptions(): CoreOptions {
  return getNextProxy();
}

function getNextProxy(): { proxy: string, jar: CookieJar } {
  if (proxies.length == 0) return proxies[0];
  if (lastProxy >= proxies.length) lastProxy = 0;

  return proxies[lastProxy++];
}