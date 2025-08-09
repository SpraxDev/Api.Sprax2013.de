import { injectAll, singleton } from 'tsyringe';
import { ContainerTokens } from '../../constants.js';
import MinecraftProfile from '../value-objects/MinecraftProfile.js';
import { CapeType } from './CapeType.js';
import CapeProvider, { CapeResponse } from './provider/CapeProvider.js';

@singleton()
export default class UserCapeProvider {
  constructor(
    @injectAll(ContainerTokens.CAPE_PROVIDER) private readonly capeProviders: CapeProvider[],
  ) {
  }

  async provide(profile: MinecraftProfile, type: CapeType): Promise<CapeResponse | null> {
    for (const capeProvider of this.capeProviders) {
      if (capeProvider.capeType === type) {
        return capeProvider.provide(profile);
      }
    }

    throw new Error(`No CapeProvider found for type ${type}`);
  }
}
