import Crypto from 'node:crypto';
import Fs from 'node:fs';
import Path from 'node:path';
import { singleton } from 'tsyringe';
import { APP_RESOURCES_DIR } from '../../constants.js';
import AutoProxiedHttpClient from '../../http/clients/AutoProxiedHttpClient.js';
import SentrySdk from '../../SentrySdk.js';
import TaskScheduler from '../../task_queue/TaskScheduler.js';

@singleton()
export default class YggdrasilKeyProvider {
  private readonly initPromise: Promise<void>;
  private cachedPublicKeys: Crypto.KeyObject[] = [];

  constructor(
    private readonly httpClient: AutoProxiedHttpClient,
    taskScheduler: TaskScheduler
  ) {
    const updateKeysTask = async () => this.updatePublicKeys().catch(SentrySdk.logAndCaptureError);
    taskScheduler.runRepeating(updateKeysTask, 24 * 60 * 60 * 1000 /* 1d */);

    this.initPromise = updateKeysTask();
  }

  get publicKeys(): Crypto.KeyObject[] {
    if (this.cachedPublicKeys.length === 0) {
      return [this.loadFallbackPublicKey()];
    }

    return this.cachedPublicKeys;
  }

  async waitForInit(): Promise<void> {
    return this.initPromise;
  }

  private async updatePublicKeys(): Promise<void> {
    const publicKeyResponse = await this.httpClient.get('https://api.minecraftservices.com/publickeys');
    if (!publicKeyResponse.ok) {
      throw new Error(`Got HTTP status code ${publicKeyResponse.statusCode} while fetching Minecraft public keys`);
    }

    const publicKeys: Crypto.KeyObject[] = [];

    const publicKeysJson = await publicKeyResponse.parseBodyAsJson<any>();
    if (!Array.isArray(publicKeysJson?.profilePropertyKeys)) {
      throw new Error('Invalid response from Minecraft public keys API: Missing "profilePropertyKeys" property');
    }

    for (const profilePropertyKey of publicKeysJson.profilePropertyKeys) {
      if (typeof profilePropertyKey.publicKey !== 'string') {
        throw new Error('Invalid response from Minecraft public keys API: Invalid "publicKey" property');
      }

      publicKeys.push(Crypto.createPublicKey({
        key: `-----BEGIN PUBLIC KEY-----\n${profilePropertyKey.publicKey}\n-----END PUBLIC KEY-----`,
        format: 'pem'
      }));
    }

    this.cachedPublicKeys = publicKeys;
  }

  private loadFallbackPublicKey(): Crypto.KeyObject {
    const fallbackKey = Fs.readFileSync(Path.join(APP_RESOURCES_DIR, 'fallback_yggdrasil_pubkey.der'));
    return Crypto.createPublicKey({
      key: fallbackKey,
      format: 'der',
      type: 'spki'
    });
  }
}
