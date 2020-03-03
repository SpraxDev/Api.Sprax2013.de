import { addHyphensToUUID } from './utils';

/* SpraxAPI */
export interface SpraxAPIcfg {
  readonly listen: {
    readonly usePath: boolean,
    readonly path: string,

    readonly host: string,
    readonly port: number
  };

  readonly trustProxy: boolean;

  readonly logging: {
    readonly accessLogFormat: string;
    readonly discordErrorWebHookURL: string | null;
  }
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

export interface UserAgent {
  readonly id: number;
  readonly name: string;
  readonly internal: boolean;
}

export interface Skin {
  readonly id: number;
  readonly duplicateOf?: number;
  readonly originalURL: string;
  readonly textureValue?: string;
  readonly textureSignature?: string;
  readonly added: Date;
  readonly addedBy: number;
  readonly cleanHash?: string;
}

export interface Cape {
  readonly id: number;
  readonly duplicateOf?: number;
  readonly type: CapeType;
  readonly originalURL: string;
  readonly addedBy: number;
  readonly added: Date;
  readonly cleanHash?: string;
  readonly textureValue?: string;
  readonly textureSignature?: string;
}

/**
 * value equals remote database enum
*/
export enum CapeType {
  MOJANG = 'MOJANG',
  OPTIFINE = 'OPTIFINE',
  LABY_MOD = 'LABY_MOD'
}

export enum SkinArea {
  HEAD = 'HEAD',
  BUST = 'BUST',
  BODY = 'BODY'
}

/* Image (utils) */
export interface Color {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly alpha: number;
}

/* Minecraft */
export class MinecraftUser {
  id: string;
  name: string;
  legacy: boolean | null;

  skinURL: string | null = null;
  capeURL: string | null = null;
  textureValue: string | null = null;
  textureSignature: string | null = null;

  modelSlim: boolean = false;

  nameHistory: MinecraftNameHistoryElement[];
  userAgent: UserAgent;

  constructor(profile: MinecraftProfile, nameHistory: MinecraftNameHistoryElement[], userAgent: UserAgent, profileFromMojang: boolean = false) {
    this.id = profile.id;
    this.name = profile.name;
    this.legacy = profile.legacy || (profileFromMojang ? false : null);
    this.nameHistory = nameHistory;
    this.userAgent = userAgent;

    for (const prop of profile.properties) {
      if (prop.name == 'textures') {
        this.textureValue = prop.value;
        this.textureSignature = prop.signature || null;

        const json: MinecraftProfileTextureProperty = JSON.parse(Buffer.from(prop.value, 'base64').toString('utf-8'));
        this.skinURL = json.textures.SKIN?.url || null;
        this.capeURL = json.textures.CAPE?.url || null;
        this.modelSlim = json.textures.SKIN?.metadata?.model == 'slim' || false;
      }
    }
  }

  getSecureSkinURL(): string | null {
    if (!this.skinURL) return null;
    if (!this.skinURL.toLowerCase().startsWith('http://')) return this.skinURL;

    return 'https' + this.skinURL.substring(4);
  }

  getSecureCapeURL(): string | null {
    if (!this.capeURL) return null;
    if (!this.capeURL.toLowerCase().startsWith('http://')) return this.capeURL;

    return 'https' + this.capeURL.substring(4);
  }

  getOptiFineCapeURL(): string {
    return `http://s.optifine.net/capes/${this.name}.png`;
  }

  getLabyModCapeURL(): string {
    return `https://capes.labymod.net/capes/${addHyphensToUUID(this.id)}`;
  }

  /**
   * @author NudelErde (https://github.com/NudelErde/)
   */
  isAlexDefaultSkin(): boolean {
    return ((parseInt(this.id[7], 16) ^ parseInt(this.id[15], 16) ^ parseInt(this.id[23], 16) ^ parseInt(this.id[31], 16)) & 1) == 1;
  }

  toCleanJSON(): { id: string, id_hyphens: string, name: string, legacy: boolean | null, textures: { skinURL: string | null, capeURL: string | null, texture_value: string | null, texture_signature: string | null }, name_history?: MinecraftNameHistoryElement[] } {
    return {
      id: this.id,
      id_hyphens: addHyphensToUUID(this.id),
      name: this.name,
      legacy: this.legacy,

      textures: {
        skinURL: this.skinURL,
        capeURL: this.capeURL,

        texture_value: this.textureValue,
        texture_signature: this.textureSignature || null,
      },

      name_history: this.nameHistory
    };
  }

  toOriginal(): MinecraftProfile {
    let properties: MinecraftProfileProperty[] = [];

    if (this.textureValue) {
      properties.push({
        name: 'textures',
        value: this.textureValue,
        signature: this.textureSignature || undefined
      });
    }

    return {
      id: this.id,
      name: this.name,
      properties,
      legacy: this.legacy ? true : undefined
    };
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
      url: string,
      metadata?: {
        model?: 'slim'
      }
    },
    CAPE?: {
      url: string
    }
  }
}

export interface MinecraftNameHistoryElement {
  name: string;
  changedToAt?: number;
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