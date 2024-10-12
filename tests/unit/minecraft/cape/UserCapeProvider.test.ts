import { CapeType } from '../../../../src/minecraft/cape/CapeType.js';
import CapeProvider, { CapeResponse } from '../../../../src/minecraft/cape/provider/CapeProvider.js';
import UserCapeProvider from '../../../../src/minecraft/cape/UserCapeProvider.js';
import MinecraftProfile from '../../../../src/minecraft/value-objects/MinecraftProfile.js';
import { EXISTING_MC_PROFILE } from '../../../test-constants.js';

class TestCapeProvider implements CapeProvider {
  public readonly provideResponse: CapeResponse = {
    image: Buffer.from('A PNG'),
    mimeType: 'image/png',
    ageInSeconds: 0
  };

  get capeType() {
    return CapeType.OPTIFINE;
  }

  async provide(profile: MinecraftProfile): Promise<CapeResponse | null> {
    return this.provideResponse;
  }
}

describe('UserCapeProvider', () => {
  const testCapeProvider = new TestCapeProvider();
  const userCapeProvider = new UserCapeProvider([testCapeProvider]);

  test('Throws exception when no CapeProvider is found', async () => {
    await expect(userCapeProvider.provide(EXISTING_MC_PROFILE, CapeType.MOJANG)).rejects.toThrow('No CapeProvider found for type MOJANG');
  });

  test('Returns the response from the CapeProvider', async () => {
    const response = await userCapeProvider.provide(EXISTING_MC_PROFILE, CapeType.OPTIFINE);
    expect(response).toBe(testCapeProvider.provideResponse);
  });
});
