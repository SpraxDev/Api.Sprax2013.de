import { inject, singleton } from 'tsyringe';
import ProxiedHttpClient from './ProxiedHttpClient.js';

/**
 * This client is intended to be used for trusted remote servers, and might not always use a proxy
 */
@singleton()
export default class TrustedProxiedHttpClient extends ProxiedHttpClient {
  constructor(
    @inject('value.proxies.http') proxyUris: string[]
  ) {
    super(proxyUris, true);
  }
}
