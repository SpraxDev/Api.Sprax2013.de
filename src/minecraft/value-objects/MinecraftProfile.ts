import { UuidToProfileResponse } from '../MinecraftApiClient.js';
import MinecraftProfileTextures from './MinecraftProfileTextures.js';

export type DefaultSkin = 'alex' | 'steve';

export default class MinecraftProfile {
  constructor(
    private readonly rawProfile: UuidToProfileResponse
  ) {
  }

  get id() {
    return this.rawProfile.id;
  }

  get name() {
    return this.rawProfile.name;
  }

  getRawProfile(): Readonly<UuidToProfileResponse> {
    return this.rawProfile;
  }

  parseTextures(): MinecraftProfileTextures | null {
    const texturesProperty = this.getTexturesProperty();
    if (texturesProperty != null) {
      return MinecraftProfileTextures.fromPropertyValue(texturesProperty.value);
    }
    return null;
  }

  getTexturesProperty(): UuidToProfileResponse['properties'][0] | null {
    return this.getProperty('textures');
  }

  getProperty(name: string): UuidToProfileResponse['properties'][0] | null {
    for (const property of this.rawProfile.properties) {
      if (property.name === name) {
        return property;
      }
    }
    return null;
  }

  determineDefaultSkin(): DefaultSkin {
    const unevenJavaHashCode = ((parseInt(this.id[7], 16) ^ parseInt(this.id[15], 16) ^ parseInt(this.id[23], 16) ^ parseInt(this.id[31], 16)) & 1) == 1;
    return unevenJavaHashCode ? 'alex' : 'steve';
  }
}
