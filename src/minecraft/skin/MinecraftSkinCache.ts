import { singleton } from 'tsyringe';
import DatabaseClient from '../../database/DatabaseClient.js';
import ImageManipulator from '../image/ImageManipulator.js';
import { PerformanceMonitor } from '../../util/PerformanceMonitor.js';
import SkinImageManipulator from './manipulator/SkinImageManipulator.js';

export type CachedSkin = {
  imageId: bigint,
  original: SkinImageManipulator,
  normalized: SkinImageManipulator
}

@singleton()
export default class MinecraftSkinCache {
  // Add in-memory cache for frequently accessed skins
  private readonly memoryCache = new Map<string, { skin: CachedSkin; timestamp: number }>();
  private readonly MEMORY_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  private readonly MEMORY_CACHE_MAX_SIZE = 100; // Limit memory usage

  constructor(
    private readonly databaseClient: DatabaseClient,
  ) {
    // Periodically clean up expired cache entries
    setInterval(() => this.cleanupMemoryCache(), 60 * 1000); // Every minute
  }

  async findIdByUrl(skinUrl: string): Promise<bigint | null> {
    const skinInDatabase = await this.databaseClient.skinUrl.findUnique({
      where: { url: skinUrl },
      select: { skinId: true },
    });
    return skinInDatabase?.skinId ?? null;
  }

  async findByUrl(skinUrl: string): Promise<CachedSkin | null> {
    // Check memory cache first
    const cached = this.memoryCache.get(skinUrl);
    if (cached && Date.now() - cached.timestamp < this.MEMORY_CACHE_TTL) {
      PerformanceMonitor.recordCacheHit('memory');
      return cached.skin;
    }

    const skinInDatabase = await this.databaseClient.skinUrl.findUnique({
      where: { url: skinUrl },
      select: {
        skin: {
          select: {
            id: true,
            imageBytes: true,
            normalizedSkin: true,
          },
        },
      },
    });

    if (skinInDatabase == null) {
      PerformanceMonitor.recordCacheMiss('memory');
      return null;
    }

    const skinImage = await SkinImageManipulator.createByImage(skinInDatabase.skin.imageBytes);
    let normalizedSkin = skinImage;
    if (skinInDatabase.skin.normalizedSkin != null) {
      normalizedSkin = await SkinImageManipulator.createByImage(skinInDatabase.skin.normalizedSkin.imageBytes);
    }

    const result: CachedSkin = {
      imageId: skinInDatabase.skin.id,
      original: skinImage,
      normalized: normalizedSkin,
    };

    // Add to memory cache
    this.addToMemoryCache(skinUrl, result);

    return result;
  }

  private addToMemoryCache(skinUrl: string, skin: CachedSkin): void {
    // Remove oldest entries if cache is full
    if (this.memoryCache.size >= this.MEMORY_CACHE_MAX_SIZE) {
      const oldestKey = this.memoryCache.keys().next().value;
      if (oldestKey) {
        this.memoryCache.delete(oldestKey);
      }
    }

    this.memoryCache.set(skinUrl, {
      skin,
      timestamp: Date.now(),
    });
  }

  private cleanupMemoryCache(): void {
    const now = Date.now();
    const entries = Array.from(this.memoryCache.entries());
    for (const [key, value] of entries) {
      if (now - value.timestamp > this.MEMORY_CACHE_TTL) {
        this.memoryCache.delete(key);
      }
    }
  }

  async existsSkinUrlWithNonNullTextureValue(skinUrl: string): Promise<boolean> {
    const existingSkinUrl = await this.databaseClient.skinUrl.findUnique({
      where: { url: skinUrl, textureValue: { not: null }, textureSignature: { not: null } },
      select: { url: true },
    });
    return existingSkinUrl != null;
  }

  async existsByImageBytes(skin: Buffer): Promise<boolean> {
    const skinPixelDataHash = await this.computePixelDataHash(skin);
    const existingSkinImage = await this.databaseClient.skin.findUnique({
      where: { pixelDataHash: skinPixelDataHash },
      select: { id: true },
    });
    return existingSkinImage != null;
  }

  private async computePixelDataHash(buffer: Buffer): Promise<Buffer> {
    return (await ImageManipulator.createByImage(buffer)).calculatePixelDataHashXXH128();
  }
}
