import * as Undici from 'undici';
import SentrySdk from '../../SentrySdk.js';
import HttpClient from '../HttpClient.js';

export default abstract class ProxiedHttpClient extends HttpClient {
  private readonly dispatchers: Undici.Dispatcher[] = [];

  private nextDispatcherIndex = 0;

  protected constructor(proxyUris: string[], allowNonProxyConnections: boolean) {
    super();

    if (allowNonProxyConnections) {
      this.dispatchers.push(new Undici.Agent(this.getDefaultAgentOptions()));
    }
    for (const proxyUri of proxyUris) {
      this.dispatchers.push(new Undici.ProxyAgent({
        ...this.getDefaultAgentOptions(),
        uri: proxyUri
      }));
    }

    if (this.dispatchers.length === 0) {
      SentrySdk.logAndCaptureWarning(
        'A ProxiedHttpClient was created without any dispatchers – This is likely a configuration error',
        { proxyUris, allowNonProxyConnections }
      );
    }
  }

  protected selectDispatcher(): Undici.Dispatcher {
    if (this.dispatchers.length === 0) {
      throw new Error('No dispatchers available');
    }

    const dispatcher = this.dispatchers[this.nextDispatcherIndex];
    this.nextDispatcherIndex = (this.nextDispatcherIndex + 1) % this.dispatchers.length;
    return dispatcher;
  }
}
