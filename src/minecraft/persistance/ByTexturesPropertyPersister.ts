import * as PrismaClient from '@prisma/client';
import { singleton } from 'tsyringe';
import DatabaseClient from '../../database/DatabaseClient.js';
import AutoProxiedHttpClient from '../../http/clients/AutoProxiedHttpClient.js';
import CapeCache from '../cape/CapeCache.js';
import MinecraftProfileCache from '../profile/MinecraftProfileCache.js';
import MinecraftProfileService from '../profile/MinecraftProfileService.js';
import MinecraftSkinNormalizer from '../skin/manipulator/MinecraftSkinNormalizer.js';
import SkinImageManipulator from '../skin/manipulator/SkinImageManipulator.js';
import MinecraftSkinCache from '../skin/MinecraftSkinCache.js';
import MinecraftProfileTextures from '../value-objects/MinecraftProfileTextures.js';
import CapePersister from './base/CapePersister.js';
import ProfileSeenCapePersister from './base/ProfileSeenCapePersister.js';
import ProfileSeenNamePersister from './base/ProfileSeenNamePersister.js';
import ProfileSeenSkinPersister from './base/ProfileSeenSkinPersister.js';
import SkinPersister from './base/SkinPersister.js';

@singleton()
export default class ByTexturesPropertyPersister {
  constructor(
    private readonly httpClient: AutoProxiedHttpClient,
    private readonly minecraftProfileService: MinecraftProfileService,
    private readonly databaseClient: DatabaseClient,
    private readonly minecraftProfileCache: MinecraftProfileCache,
    private readonly skinCache: MinecraftSkinCache,
    private readonly capeCape: CapeCache,
    private readonly minecraftSkinNormalizer: MinecraftSkinNormalizer,
    private readonly skinPersister: SkinPersister,
    private readonly capePersister: CapePersister,
    private readonly profileSeenNamesPersister: ProfileSeenNamePersister,
    private readonly profileSeenSkinPersister: ProfileSeenSkinPersister,
    private readonly profileSeenCapePersister: ProfileSeenCapePersister,
  ) {
  }

  async persist(texturesProperty: { value: string, signature: string }): Promise<void> {
    const parsedTextures = MinecraftProfileTextures.fromPropertyValue(texturesProperty.value);

    await this.ensureProfileIdIsKnown(parsedTextures);

    const promises: Promise<void>[] = [];

    promises.push(this.profileSeenNamesPersister.persist(parsedTextures.profileId, parsedTextures.profileName, parsedTextures.timestamp));

    const skinUrl = parsedTextures.getSecureSkinUrl();
    if (skinUrl != null) {
      promises.push((async () => {
        let skinId = await this.skinCache.findIdByUrl(skinUrl);
        if (skinId == null) {
          const skinImage = await this.downloadImage(skinUrl);

          const originalSkin = await SkinImageManipulator.createByImage(skinImage);
          const normalizedSkin = await this.minecraftSkinNormalizer.normalizeSkin(originalSkin);

          skinId = await this.skinPersister.persist(skinImage, await normalizedSkin.toPngBuffer(), texturesProperty);
        }

        await this.profileSeenSkinPersister.persist(parsedTextures.profileId, skinId, parsedTextures.timestamp);
      })());
    }

    const capeUrl = parsedTextures.getSecureCapeUrl();
    if (capeUrl != null) {
      promises.push((async () => {
        let capeId = await this.capeCape.findIdByTypeAndUrl(PrismaClient.CapeType.MOJANG, capeUrl);
        if (capeId == null) {
          const capeImage = await this.downloadImage(capeUrl);
          capeId = await this.capePersister.persistMojangCape(texturesProperty.value, capeImage);
        }

        await this.profileSeenCapePersister.persist(parsedTextures.profileId, capeId, parsedTextures.timestamp);
      })());
    }

    await Promise.all(promises);
  }

  private async downloadImage(url: string): Promise<Buffer> {
    const downloadedCape = await this.httpClient.get(url);
    if (!downloadedCape.ok) {
      throw new Error(`Fetching '${url}' failed with HTTP status code ${downloadedCape.statusCode}`);
    }
    return downloadedCape.body;
  }

  private async ensureProfileIdIsKnown(profileTextures: MinecraftProfileTextures): Promise<void> {
    const knownProfile = await this.databaseClient.profile.findUnique({
      where: {
        id: profileTextures.profileId,
      },
    });

    if (knownProfile == null) {
      await this.createEmptyDeletedProfile(profileTextures);
      return;
    }

    const isADeletedAndEmptyProfile = knownProfile.deleted &&
      knownProfile.firstSeen === knownProfile.updatedAt &&
      knownProfile.firstSeen < profileTextures.timestamp &&
      JSON.stringify(knownProfile.raw) === '{}';
    if (isADeletedAndEmptyProfile) {
      await this.databaseClient.profile.update({
        where: { id: profileTextures.profileId },
        data: {
          nameLowercase: profileTextures.profileName.toLowerCase(),
          firstSeen: profileTextures.timestamp,
          updatedAt: profileTextures.timestamp,
        },
      });
    }
  }

  private async createEmptyDeletedProfile(profileTextures: MinecraftProfileTextures): Promise<void> {
    await this.databaseClient.profile.createMany({
      data: [{
        id: profileTextures.profileId,
        nameLowercase: profileTextures.profileName.toLowerCase(),
        raw: {},
        deleted: true,
        firstSeen: profileTextures.timestamp,
        updatedAt: profileTextures.timestamp,
      }],
      skipDuplicates: true,
    });
  }
}
