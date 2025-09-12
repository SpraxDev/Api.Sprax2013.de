import { singleton } from 'tsyringe';

export type AppConfig = {
  serverInterface: string;
  serverPort: number;
  proxyServerUris: string;
  questDbMetricsConfig: string;

  workerTickIntervalDynamic: boolean;
};

@singleton()
export default class AppConfiguration {
  public readonly config: AppConfig;

  constructor() {
    this.config = this.deepFreeze({
      serverInterface: process.env.SPRAXAPI_SERVER_INTERFACE ?? '0.0.0.0',
      serverPort: parseInt(process.env.SPRAXAPI_SERVER_PORT ?? '', 10) || 8087,
      proxyServerUris: process.env.PROXY_SERVER_URIS ?? '',
      questDbMetricsConfig: process.env.QUESTDB_METRICS_CONFIG ?? '',

      workerTickIntervalDynamic: process.env.WORKER_TICK_INTERVAL_DYNAMIC === '1',
    } satisfies AppConfig);
  }

  private deepFreeze(obj: any): any {
    for (const key of Object.keys(obj)) {
      if (typeof obj[key] === 'object') {
        this.deepFreeze(obj[key]);
      }
    }
    return Object.freeze(obj);
  }
}
