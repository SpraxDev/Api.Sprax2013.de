import Os from 'node:os';
import { getAppInfo } from '../constants.js';

export default class UserAgentGenerator {
  static generateDefault(): string {
    const appInfo = getAppInfo();
    return this.generate(appInfo.name, appInfo.version, true, appInfo.homepage);
  }

  static generate(appName: string, appVersion: string, includeSystemInfo: boolean = true, appUrl?: string): string {
    let userAgent = `${appName}/${appVersion}`;

    if (includeSystemInfo) {
      userAgent += ` (${Os.type()}; ${process.arch}; ${process.platform})`;
    }

    if (appUrl != null) {
      userAgent += ` (+${appUrl})`;
    }

    return userAgent;
  }
}
