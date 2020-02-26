/* SpraxAPI */
export interface SpraxAPIcfg {
  readonly listen: {
    readonly usePath: boolean,
    readonly path: string,

    readonly host: string,
    readonly port: number
  };

  readonly trustProxy: boolean;
}

export interface SpraxAPIdbCfg {
  readonly host: string;
  readonly port: number;
  readonly user: string;
  readonly password: string;
  readonly ssl: boolean;
  readonly connectionPoolSize: number;

  readonly databases: {
    readonly skindb: string;
  };
}

/* Minecraft */
export class MinecraftUser {
  uuid: string;
  username: string;
  legacy?: boolean;

  skinURL: string | null = null;
  capeURL: string | null = null;
  textureValue: string | null = null;
  textureSignature: string | null = null;

  constructor(profile: MinecraftProfile) {
    this.uuid = profile.id;
    this.username = profile.name;
    this.legacy = profile.legacy;

    for (const prop of profile.properties) {
      if (prop.name == 'textures') {
        this.textureValue = prop.value;
        this.textureSignature = prop.signature || null;

        const json: MinecraftProfileTextureProperty = JSON.parse(Buffer.from(prop.value, 'base64').toString('utf-8'));
        this.skinURL = json.textures.SKIN?.url || null;
        this.capeURL = json.textures.CAPE?.url || null;
      }
    }
  }

  /**
   * @author NudelErde (https://github.com/NudelErde/)
   */
  isAlexDefaultSkin(): boolean {
    return ((parseInt(this.uuid[7], 16) ^ parseInt(this.uuid[15], 16) ^ parseInt(this.uuid[23], 16) ^ parseInt(this.uuid[31], 16)) & 1) == 1;
  }

  toJSONString() {
    let properties: MinecraftProfileProperty[] | undefined;

    if (this.textureValue) {
      properties = [];
      properties.push({
        name: 'textures',
        value: this.textureValue,
        signature: this.textureSignature || undefined
      });
    }

    return JSON.stringify({
      id: this.uuid,
      name: this.username,
      properties,
      legacy: this.legacy
    });
  }
}

export interface MinecraftProfile {
  id: string,
  name: string,
  properties: MinecraftProfileProperty[],
  legacy?: boolean
}

export interface MinecraftProfileProperty {
  name: 'textures',
  value: string,
  signature?: string
}

export interface MinecraftProfileTextureProperty {
  timestamp: number,
  profileId: string,
  profileName: string,
  signatureRequired?: boolean,
  textures: {
    SKIN?: {
      url: string
    },
    CAPE?: {
      url: string
    }
  }
}

/* Database */
// export enum ProfileRefreshPriority {
//   SKINDB = 1,
//   DEFAULT = 100
// }
// export function getProfileRefreshPriority(prioStr: string): number | null {
//   if (isValidProfileRefreshPriority(prioStr)) {
//     return (ProfileRefreshPriority as any)[prioStr];  //TODO: Find solution without 'as any'
//   }

//   return null;
// }

// export function isValidProfileRefreshPriority(prioStr: string): boolean {
//   return prioStr in ProfileRefreshPriority;
// }