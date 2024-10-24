export default class MinecraftProfileTextures {
  constructor(
    public readonly profileId: string,
    public readonly profileName: string,
    public readonly timestamp: Date,
    public readonly skinUrl: string | null,
    public readonly capeUrl: string | null,
    public readonly slimPlayerModel: boolean
  ) {
  }

  getSecureSkinUrl(): string | null {
    if (this.skinUrl == null) {
      return null;
    }
    return this.turnIntoSecureUrl(this.skinUrl);
  }

  getSecureCapeUrl(): string | null {
    if (this.capeUrl == null) {
      return null;
    }
    return this.turnIntoSecureUrl(this.capeUrl);
  }

  hasOfficialSkinUrl(): boolean {
    return this.skinUrl != null && MinecraftProfileTextures.isOfficialTextureUrl(this.skinUrl);
  }

  private turnIntoSecureUrl(url: string): string {
    if (url.toLowerCase().startsWith('http:')) {
      return 'https' + url.substring(4);
    }
    return url;
  }

  static fromPropertyValue(propertyValue: string): MinecraftProfileTextures {
    const parsedValue = JSON.parse(Buffer.from(propertyValue, 'base64').toString('utf-8'));

    return new MinecraftProfileTextures(
      parsedValue.profileId,
      parsedValue.profileName,
      new Date(parsedValue.timestamp),
      parsedValue.textures.SKIN?.url ?? null,
      parsedValue.textures.CAPE?.url ?? null,
      parsedValue.textures.SKIN?.metadata?.model === 'slim'
    );
  }

  static isOfficialTextureUrl(skinUrl: string): boolean {
    const parsedHostname = new URL(skinUrl).hostname;
    return parsedHostname.endsWith('.minecraft.net') || parsedHostname.endsWith('.mojang.com');
  }
}
