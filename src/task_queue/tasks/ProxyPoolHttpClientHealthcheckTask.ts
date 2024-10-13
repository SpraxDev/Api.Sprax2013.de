import { singleton } from 'tsyringe';
import * as Undici from 'undici';
import QuestDbClient, { ProxyServerMetric } from '../../database/QuestDbClient.js';
import ProxyPoolHttpClient, { UndiciProxyServer } from '../../http/clients/ProxyPoolHttpClient.js';
import UserAgentGenerator from '../../http/UserAgentGenerator.js';
import SentrySdk from '../../util/SentrySdk.js';
import Task, { TaskPriority } from './Task.js';

@singleton()
export default class ProxyPoolHttpClientHealthcheckTask extends Task {
  private static readonly HEALTHCHECK_URL = 'https://checkip.sprax.dev/';
  private static readonly USER_AGENT = UserAgentGenerator.generateDefault();

  private readonly clientList: WeakRef<ProxyPoolHttpClient>[] = [];

  constructor(
    private readonly questDbClient: QuestDbClient
  ) {
    super('ProxyPoolHttpClientHealthcheckTask', TaskPriority.HIGH);
  }

  async run(): Promise<void> {
    for (let i = this.clientList.length - 1; i >= 0; --i) {
      const httpClientRef = this.clientList[i];
      const httpClient = httpClientRef.deref();

      if (httpClient == null) {
        this.clientList.splice(i, 1);
        continue;
      }

      const healthcheckStart = new Date();
      const proxyMetrics: ProxyServerMetric[] = [];
      for (const proxy of httpClient.proxyPool.getAllProxies()) {
        await this.doHealthcheck(proxy);

        proxyMetrics.push({
          displayName: proxy.displayName,
          online: !proxy.health.unhealthy,
          rttMs: proxy.health.lastReferenceRttMs,
          timestamp: healthcheckStart
        });
      }

      await this.questDbClient.pushProxyServerMetric(proxyMetrics);
    }
  }

  equals(other: Task): boolean {
    return other instanceof ProxyPoolHttpClientHealthcheckTask;
  }

  registerHttpClient(httpClient: ProxyPoolHttpClient): void {
    this.clientList.push(new WeakRef(httpClient));
  }

  private async doHealthcheck(proxy: UndiciProxyServer): Promise<void> {
    const unhealthySeconds = proxy.health.unhealthySince ? Math.floor((Date.now() - proxy.health.unhealthySince.getTime()) / 1000) : 0;

    try {
      const startTime = process.hrtime.bigint();
      const response = await Undici.request(ProxyPoolHttpClientHealthcheckTask.HEALTHCHECK_URL, {
        dispatcher: proxy.undiciDispatcher,
        headers: {
          'User-Agent': ProxyPoolHttpClientHealthcheckTask.USER_AGENT
        },
        bodyTimeout: 3000,
        headersTimeout: 3000
      });
      if (response.statusCode !== 200) {
        throw new Error('Unexpected HTTP status code: ' + response.statusCode);
      }

      const healthcheckTotalTime = process.hrtime.bigint() - startTime;
      const referenceRttMs = Number(healthcheckTotalTime / 1_000_000n);

      if (proxy.health.unhealthy) {
        console.info(`[ProxyHealthcheck] Unhealthy proxy '${proxy.displayName}' is healthy again! (was unhealthy for ${unhealthySeconds} s) (referenceRtt of ${referenceRttMs} ms)`);
      }
      proxy.health = {
        unhealthy: false,
        lastChecked: new Date(),
        lastReferenceRttMs: referenceRttMs
      };
    } catch (err: any) {
      SentrySdk.logAndCaptureWarning(`[ProxyHealthcheck] Proxy '${proxy.displayName}' is unhealthy: ${err.message}`, { err });

      proxy.health = {
        unhealthy: true,
        unhealthySince: proxy.health.unhealthySince ?? new Date(),
        lastChecked: new Date()
      };
    }
  }
}
