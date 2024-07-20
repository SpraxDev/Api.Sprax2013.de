import { injectAll, singleton } from 'tsyringe';
import MinecraftProfile from '../value-objects/MinecraftProfile.js';
import { CapeType } from './CapeType.js';
import CapeProvider, { CapeResponse } from './provider/CapeProvider.js';

@singleton()
export default class UserCapeProvider {
  constructor(
    @injectAll('CapeProvider') private readonly capeProviders: CapeProvider[]
  ) {
  }

  provide(profile: MinecraftProfile, type: CapeType): Promise<CapeResponse | null> {
    for (const capeProvider of this.capeProviders) {
      if (capeProvider.capeType === type) {
        return capeProvider.provide(profile);
      }
    }

    throw new Error(`No CapeProvider found for type ${type}`);
  }
}
