import { UserAgentGenerator as UserAgentGeneratorLib } from '@spraxdev/node-commons/http';
import { getAppInfo } from '../constants.js';

export default class UserAgentGenerator {
  static generateDefault(): string {
    const appInfo = getAppInfo();
    return UserAgentGeneratorLib.generate(appInfo.name, appInfo.version, true, appInfo.homepage);
  }
}
