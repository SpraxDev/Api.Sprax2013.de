import { singleton } from 'tsyringe';
import LazyImportTaskCreator from '../../import_queue/LazyImportTaskCreator.js';
import type { UuidToProfileResponse } from '../MinecraftApiClient.js';
import MinecraftProfile from '../value-objects/MinecraftProfile.js';
import ProfilePersister from './base/ProfilePersister.js';
import ProfileSeenNamesPersister from './base/ProfileSeenNamesPersister.js';

@singleton()
export default class ByPlayerProfileLazyPersister {
  constructor(
    private readonly profilePersister: ProfilePersister,
    private readonly profileSeenNamesPersister: ProfileSeenNamesPersister,
    private readonly lazyImportTaskCreator: LazyImportTaskCreator
  ) {
  }

  async persist(profile: UuidToProfileResponse): Promise<void> {
    await this.profilePersister.persist(profile);

    const textureProperty = new MinecraftProfile(profile).getTexturesProperty();
    if (textureProperty != null) {
      this.lazyImportTaskCreator.lazyQueueTextureProperty(textureProperty);
      return;
    }

    await this.profileSeenNamesPersister.persist(profile.id, profile.name, null);
  }
}
