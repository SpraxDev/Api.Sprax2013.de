import Crypto from 'node:crypto';
import { singleton } from 'tsyringe';
import YggdrasilKeyProvider from './YggdrasilKeyProvider.js';

@singleton()
export default class YggdrasilSignatureChecker {
  constructor(
    private readonly yggdrasilKeyProvider: YggdrasilKeyProvider
  ) {
  }

  async checkProfileProperty(value: string, signature: string): Promise<boolean> {
    await this.yggdrasilKeyProvider.waitForInit();

    for (const publicKey of this.yggdrasilKeyProvider.publicKeys) {
      const verify = Crypto.createVerify('sha1WithRSAEncryption');
      verify.update(value);

      if (verify.verify(publicKey, signature, 'base64')) {
        return true;
      }
    }

    return false;
  }
}
