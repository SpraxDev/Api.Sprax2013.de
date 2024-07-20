import MinecraftProfile from '../../value-objects/MinecraftProfile.js';
import { CapeType } from '../CapeType.js';

export type CapeResponse = {
  image: Buffer;
  mimeType: string;
}

export default interface CapeProvider {
  get capeType(): CapeType;

  provide(profile: MinecraftProfile): Promise<CapeResponse | null>;
}
