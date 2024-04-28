import { addHyphensToUUID, ApiError } from './utils/utils';
import { httpGet } from './utils/web';

/* SpraxAPI */
export interface SpraxAPIcfg {
  readonly instanceName: string;
  readonly sentryDsn: string;

  readonly listen: {
    readonly usePath: boolean;
    readonly path: string;

    readonly host: string;
    readonly port: number;
  }

  readonly trustProxy: boolean;

  readonly logging: {
    readonly accessLogFormat: string;
    readonly discordErrorWebHookURL: string | null;
    readonly database: string | null;
  }

  readonly redis: {
    readonly enabled: boolean;
    readonly host: string;
    readonly port: number;
    readonly db: number;
    readonly password: string;
  }

  // readonly proxies: string[];
}

export interface SpraxAPIdbCfg {
  readonly enabled: boolean;
  readonly host: string;
  readonly port: number;
  readonly user: string;
  readonly password: string;
  readonly ssl: boolean;
  readonly connectionPoolSize: number;

  readonly databases: {
    readonly skindb: string;
  }
}

export interface UserAgent {
  readonly id: number;
  readonly name: string;
  readonly internal: boolean;
}

export interface Skin {
  readonly id: string;
  readonly duplicateOf?: string;
  readonly originalURL?: string;
  readonly textureValue?: string;
  readonly textureSignature?: string;
  readonly added: Date;
  readonly addedBy: number;
  readonly cleanHash?: string;
}

export interface Cape {
  readonly id: string;
  readonly duplicateOf?: string;
  readonly type: CapeType;
  readonly originalURL: string;
  readonly addedBy: number;
  readonly added: Date;
  readonly cleanHash?: string;
  readonly textureValue?: string;
  readonly textureSignature?: string;
}

/* SkinDB */

/**
 * value equals remote database enum
 */
export enum CapeType {
  MOJANG = 'MOJANG',
  OPTIFINE = 'OPTIFINE',
  LABYMOD = 'LABYMOD'
}

export enum SkinArea {
  HEAD = 'HEAD',
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
export interface MinecraftUUIDResponse {
  name: string;
  id: string;
}

export interface CleanMinecraftUser {
  id: string;
  id_hyphens: string;
  name: string;
  legacy: boolean | null;

  textures: {
    skinURL: string | null;
    capeURL: string | null;
    texture_value: string | null;
    texture_signature: string | null;
  }

  name_history?: MinecraftNameHistoryElement[];
}

export class MinecraftUser {
  id: string;
  name: string;
  legacy: boolean | null;

  skinURL: string | null = null;
  capeURL: string | null = null;
  textureValue: string | null = null;
  textureSignature: string | null = null;

  modelSlim: boolean = false;

  userAgent: UserAgent;

  constructor(profile: MinecraftProfile, userAgent: UserAgent) {
    this.id = profile.id;
    this.name = profile.name;
    this.legacy = profile.legacy ?? null;
    this.userAgent = userAgent;

    for (const prop of profile.properties) {
      if (prop.name == 'textures') {
        this.textureValue = prop.value;
        this.textureSignature = prop.signature || null;

        const json: MinecraftProfileTextureProperty = MinecraftUser.extractMinecraftProfileTextureProperty(prop.value);
        this.skinURL = json.textures.SKIN?.url || null;
        this.capeURL = json.textures.CAPE?.url || null;
        this.modelSlim = json.textures.SKIN?.metadata?.model == 'slim' || false;
      }
    }
  }

  getSecureSkinURL(): string | null {
    if (!this.skinURL) return null;

    return MinecraftUser.getSecureURL(this.skinURL);
  }

  static getSecureURL(skinURL: string): string {
    if (!skinURL.toLowerCase().startsWith('http://')) return skinURL;

    return 'https' + skinURL.substring(4);
  }

  getSecureCapeURL(): string | null {
    if (!this.capeURL) return null;
    if (!this.capeURL.toLowerCase().startsWith('http://')) return this.capeURL;

    return 'https' + this.capeURL.substring(4);
  }

  getOptiFineCapeURL(): string {
    return `http://s.optifine.net/capes/${this.name}.png`;
  }

  async fetchLabyModCape(): Promise<Buffer | null> {
    return new Promise((resolve, reject) => {
      const capeURL = `https://dl.labymod.net/textures/../capes/${addHyphensToUUID(this.id)}`;

      httpGet(capeURL, {
        // Version can be extracted from https://dl.labymod.net/versions.json
        'User-Agent': 'LabyMod v3.7.7 on mc1.8.9'
      })
          .then((httpRes) => {
            if (httpRes.res.status == 200) {
              if (httpRes.body.length > 0) {
                return resolve(httpRes.body);
              }
            } else if (httpRes.res.status != 404) {
              ApiError.log(`${capeURL} returned HTTP-Code ${httpRes.res.status}`);
            }

            return resolve(null);
          })
          .catch(reject);
    });
  }

  /**
   * @author NudelErde (https://github.com/NudelErde/)
   */
  isAlexDefaultSkin(): boolean {
    return ((parseInt(this.id[7], 16) ^ parseInt(this.id[15], 16) ^ parseInt(this.id[23], 16) ^ parseInt(this.id[31], 16)) & 1) == 1;
  }

  toCleanJSON(): CleanMinecraftUser {
    return {
      id: this.id,
      id_hyphens: addHyphensToUUID(this.id),
      name: this.name,
      legacy: this.legacy,

      textures: {
        skinURL: this.skinURL,
        capeURL: this.capeURL,

        texture_value: this.textureValue,
        texture_signature: this.textureSignature || null
      },

      name_history: []  // TODO: remove this property
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

  static extractMinecraftProfileTextureProperty(textureValue: string): MinecraftProfileTextureProperty {
    return JSON.parse(Buffer.from(textureValue, 'base64').toString('utf-8'));
  }
}

export interface MinecraftProfile {
  id: string;
  name: string;
  properties: MinecraftProfileProperty[];
  legacy?: boolean | null;
}

export interface MinecraftProfileProperty {
  name: 'textures';
  value: string;
  signature?: string;
}

export interface MinecraftProfileTextureProperty {
  timestamp: number;
  profileId: string;
  profileName: string;
  signatureRequired?: boolean;

  textures: {
    SKIN?: {
      url: string;

      metadata?: {
        model?: 'slim';
      }
    },

    CAPE?: {
      url: string;
    }
  }
}

export interface MinecraftNameHistoryElement {
  name: string;
  changedToAt?: number;
}
