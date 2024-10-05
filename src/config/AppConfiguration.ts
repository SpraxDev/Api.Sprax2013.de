import { singleton } from 'tsyringe';

export type AppConfig = {
  serverPort: number;
  proxyServerUris: string;
  questDbMetricsConfig: string;
};

@singleton()
export default class AppConfiguration {
  public readonly config: AppConfig;

  constructor() {
    this.config = this.deepFreeze({
      serverPort: parseInt(process.env.SPRAXAPI_SERVER_PORT ?? '', 10) || 8087,
      proxyServerUris: process.env.PROXY_SERVER_URIS ?? '',
      questDbMetricsConfig: process.env.QUESTDB_METRICS_CONFIG ?? ''
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
