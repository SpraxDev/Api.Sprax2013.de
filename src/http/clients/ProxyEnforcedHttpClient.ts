import { inject, singleton } from 'tsyringe';
import ProxiedHttpClient from './ProxiedHttpClient.js';

@singleton()
export default class ProxyEnforcedHttpClient extends ProxiedHttpClient {
  constructor(
    @inject('value.proxies.http') proxyUris: string[]
  ) {
    super(proxyUris, false);
  }
}
