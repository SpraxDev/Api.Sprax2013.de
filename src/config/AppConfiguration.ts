import { singleton } from 'tsyringe';

export type AppConfig = {
  serverPort: number;
};

@singleton()
export default class AppConfiguration {
  public readonly config: AppConfig;

  constructor() {
    this.config = this.deepFreeze({
      serverPort: parseInt(process.env.SPRAXAPI_SERVER_PORT ?? '', 10) || 8087
    } satisfies AppConfig);
  }

  private getAndRemoveEnvVar(name: string): string | undefined {
    const value = process.env[name];
    delete process.env[name];
    return value;
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
