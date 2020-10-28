import { createClient, RedisClient } from 'redis';
import { promisify } from 'util';

import {
  CapeType,
  MinecraftNameHistoryElement,
  MinecraftProfile,
  MinecraftUser,
  MinecraftUUIDResponse
} from '../global';
import { fetchBlockedServers, fetchNameHistory, fetchProfile, fetchUUID } from './mojang';
import { db } from '../index';
import { ApiError, isUUID } from './utils';
import { getUserAgent } from '../routes/minecraft';
import { importByTexture, importCapeByURL } from '../routes/skindb';

export class CacheUtils {
  private static readonly KEY_PREFIX_UUID: string = 'minecraft:uuid:';
  private static readonly KEY_PREFIX_PROFILE: string = 'minecraft:profile:';
  private static readonly KEY_PREFIX_NAME_HISTORY: string = 'minecraft:name_history:';
  private static readonly KEY_BLOCKED_SERVERS: string = 'minecraft:blocked_servers:';

  private static readonly CACHE_DURATION: number = 60;  // 60 seconds
  private static readonly CACHE_DURATION_BLOCKED_SERVERS: number = 60 * 15;  // 15 minutes
  private static readonly CACHE_TIME_EMPTY: number = 60 * 5;  // 5 minutes

  private static readonly EMPTY_VALUE = JSON.stringify({'null': 'null'});
  private static readonly ERR_VALUE = JSON.stringify({'err': 'err'});

  private redisReady: boolean = false;  // TODO: Make redis optional in the config
  private readonly redisClient: RedisClient;  // TODO: Allow configuring the client
  private readonly redisGet: (key: string) => Promise<string | null>;
  private readonly redisSetEx: (key: string, ttl: number, value: string) => Promise<string | null>;

  constructor() {
    this.redisClient = createClient();

    this.redisGet = promisify(this.redisClient.get).bind(this.redisClient);
    this.redisSetEx = promisify(this.redisClient.setex).bind(this.redisClient);

    this.redisClient.on('ready', () => this.redisReady = true);
    this.redisClient.on('end', () => this.redisReady = false);
    this.redisClient.on('error', (err) => {
      console.error(err); // TODO: Log error
    });
  }

  public async getUser(nameOrUUID: string, waitForDbImport: boolean = false): Promise<MinecraftUser | null> {
    return new Promise(async (resolve, reject): Promise<void> => {
      let uuid: string;
      let uuidExists = false;

      if (isUUID(nameOrUUID)) {
        uuid = nameOrUUID.toLowerCase().replace(/-/g, '');
      } else {
        try {
          const mcUUID = await this.getUUID(nameOrUUID);

          if (!mcUUID) return resolve(null);

          uuid = mcUUID.id;
          uuidExists = true;
        } catch (err) {
          return reject(err);
        }
      }

      try {
        const profile = await this.getProfile(uuid);

        if (!profile && uuidExists) return reject(new Error(`Got Null-Profile for existing profile '${uuid}'`));
        if (!profile) return resolve(null);

        const nameHistory = profile ? await this.getNameHistory(profile.id) : null;
        if (!nameHistory && profile) return reject(new Error(`Got Null-NameHistory for existing profile '${profile.id}'`));

        // TODO: replace User-Agent
        const user = profile ? new MinecraftUser(profile, nameHistory as MinecraftNameHistoryElement[], await getUserAgent(null)) : null;

        if (!waitForDbImport || !db.isAvailable()) {
          resolve(user);
        }

        // Import into db
        if (db.isAvailable()) {
          // FIXME: DO NOT call this inside #getUser but in #getProfile etc. because it currently imports on every #getUser-call
          // TODO: clean this *shit* up
          if (user == null) {
            // We don't care about the result as the profile does not exist anymore (or never did)
            db.markUserDeleted(uuid)
                .catch((err) => {
                  // Just log errors that occurred
                  ApiError.log('Could not mark user as deleted in database', {uuid: uuid, stack: err.stack});
                });
          } else {
            db.updateUser(user)
                .then(async (): Promise<void> => {
                  /* Skin */
                  if (user.textureValue) {
                    try {
                      const importedTextures = await importByTexture(user.textureValue, user.textureSignature, user.userAgent);

                      if (importedTextures.cape) {
                        try {
                          await db.addCapeToUserHistory(user, importedTextures.cape, new Date(MinecraftUser.extractMinecraftProfileTextureProperty(user.textureValue).timestamp));
                        } catch (err) {
                          ApiError.log(`Could not update cape-history in database`, {
                            cape: importedTextures.cape.id,
                            profile: user.id,
                            stack: err.stack
                          });
                        }
                      }
                    } catch (err) {
                      ApiError.log('Could not import skin/cape from profile', {
                        skinURL: user.skinURL,
                        profile: user.id,
                        stack: (err || new Error()).stack
                      });
                    }
                  }

                  /* Capes */
                  const processCape = (capeURL: string | null, capeType: CapeType): Promise<void> => {
                    return new Promise((resolve, reject) => {
                      if (!capeURL) return resolve();

                      importCapeByURL(capeURL, capeType, user.userAgent, user.textureValue || undefined, user.textureSignature || undefined)
                          .then((cape) => {
                            if (!cape) return resolve();

                            if (capeType != 'MOJANG') {
                              db.addCapeToUserHistory(user, cape, user.textureValue ? new Date(MinecraftUser.extractMinecraftProfileTextureProperty(user.textureValue).timestamp) : 'now')
                                  .then(resolve)
                                  .catch((err) => {
                                    ApiError.log(`Could not update cape-history in database`, {
                                      cape: cape.id,
                                      profile: user.id,
                                      stack: err.stack
                                    });
                                    reject(err);
                                  });
                            }
                          })
                          .catch((err) => {
                            ApiError.log(`Could not import cape(type=${capeType}) from profile`, {
                              capeURL: capeURL,
                              profile: user.id,
                              stack: err.stack
                            });
                            reject(err);
                          });
                    });
                  };

                  try {
                    await processCape(user.getOptiFineCapeURL(), CapeType.OPTIFINE);
                  } catch (err) {
                    ApiError.log('Could not process OptiFine-Cape', err);
                  }

                  try {
                    await processCape(user.getLabyModCapeURL(), CapeType.LABYMOD);
                  } catch (err) {
                    ApiError.log('Could not process LabyMod-Cape', err);
                  }
                })
                .catch((err) => {
                  ApiError.log('Could not update user in database', {profile: user.id, stack: err.stack});
                });
          }

          if (waitForDbImport) {
            resolve(user);
          }
        }
      } catch (err) {
        return reject(err);
      }
    });
  }

  public async getUUID(username: string, at?: number): Promise<MinecraftUUIDResponse | null> {
    return new Promise(async (resolve, reject): Promise<void> => {
      const key = CacheUtils.KEY_PREFIX_UUID + username.toLowerCase() + (at ? `@${at}` : '');

      let result: object | string | null = null;
      let resultFromRedis = false;

      // Check if data is already cached in Redis
      if (this.redisReady && this.redisGet) {
        try {
          const redisResult = await this.redisGet(key);

          if (redisResult != null) {
            result = redisResult;
            resultFromRedis = true;
          }
        } catch (err) {
          console.error(err); // TODO: log error
        }
      }

      // If not cached in Redis, check if username is already know in the database
      // This also allows to resolve invalid usernames that exist but are not resolved by the Mojang-API
      if (!result && !at && db.isAvailable()) {
        try {
          const dbProfile = await db.getProfileByName(username);

          // Make sure that the profile from the db is still accurate
          // by requesting the profile for that UUID
          // if the names match, we successfully avoided contacting the strictly rate-limited Name->UUID API-Route
          if (dbProfile) {
            const freshProfile = await this.getProfile(dbProfile.id);

            if (dbProfile?.name == freshProfile?.name) {
              result = {id: freshProfile.id, name: freshProfile?.name};
            }
          }
        } catch (err) {
          console.log(err); // TODO: log error
        }
      }

      // Requesting data from Mojang-API
      if (!result) {
        try {
          const uuid = await fetchUUID(username, at);

          result = uuid ? uuid : CacheUtils.EMPTY_VALUE;
        } catch (err) {
          console.log(err); // TODO: log error
        }
      }

      // Write to Redis cache
      if (!resultFromRedis && this.redisReady && this.redisSetEx) {
        if (result == CacheUtils.EMPTY_VALUE || result == null) {
          await this.redisSetEx(key, CacheUtils.CACHE_TIME_EMPTY, CacheUtils.EMPTY_VALUE);
        } else if (result == CacheUtils.ERR_VALUE) {
          await this.redisSetEx(key, CacheUtils.CACHE_DURATION, CacheUtils.ERR_VALUE);
        } else {
          await this.redisSetEx(key, CacheUtils.CACHE_DURATION, typeof result != 'string' ? JSON.stringify(result) : result);
        }
      }

      // Fulfill promise
      if (result == null || result == CacheUtils.ERR_VALUE) {
        return reject(new Error(`An error occurred while trying to get the UUID for '${username}'`));
      } else if (result == CacheUtils.EMPTY_VALUE) {
        return resolve(null);
      } else {
        return resolve(typeof result == 'string' ? JSON.parse(result) : result);
      }
    });
  }

  public async getProfile(uuid: string): Promise<MinecraftProfile | null> {
    return new Promise(async (resolve, reject): Promise<void> => {
      const key = CacheUtils.KEY_PREFIX_PROFILE + uuid.toLowerCase().replace(/-/g, '');

      let result: object | string | null = null;
      let resultFromRedis = false;

      // Check if data is already cached in Redis
      if (this.redisReady && this.redisGet) {
        try {
          const redisResult = await this.redisGet(key);

          if (redisResult != null) {
            result = redisResult;
            resultFromRedis = true;
          }
        } catch (err) {
          console.error(err); // TODO: log error
        }
      }

      // If not cached in Redis, check if profile is already know in the database
      if (!result && db.isAvailable()) {
        try {
          const dbProfile = await db.getProfile(uuid, true);

          if (dbProfile) {
            result = dbProfile;
          }
        } catch (err) {
          console.log(err); // TODO: log error
        }
      }

      // Requesting data from Mojang-API
      if (!result) {
        try {
          const profile = await fetchProfile(uuid);

          result = profile ? profile : CacheUtils.EMPTY_VALUE;
        } catch (err) {
          console.log(err); // TODO: log error
        }
      }

      // Write to Redis cache
      if (!resultFromRedis && this.redisReady && this.redisSetEx) {
        if (result == CacheUtils.EMPTY_VALUE || result == null) {
          await this.redisSetEx(key, CacheUtils.CACHE_TIME_EMPTY, CacheUtils.EMPTY_VALUE);
        } else if (result == CacheUtils.ERR_VALUE) {
          await this.redisSetEx(key, CacheUtils.CACHE_DURATION, CacheUtils.ERR_VALUE);
        } else {
          await this.redisSetEx(key, CacheUtils.CACHE_DURATION, typeof result != 'string' ? JSON.stringify(result) : result);
        }
      }

      // Fulfill promise
      if (result == null || result == CacheUtils.ERR_VALUE) {
        return reject(new Error(`An error occurred while trying to get the profile for '${uuid}'`));
      } else if (result == CacheUtils.EMPTY_VALUE) {
        return resolve(null);
      } else {
        return resolve(typeof result == 'string' ? JSON.parse(result) : result);
      }
    });
  }

  public async getNameHistory(uuid: string): Promise<MinecraftNameHistoryElement[] | null> {
    return new Promise(async (resolve, reject): Promise<void> => {
      const cleanUUID = uuid.toLowerCase().replace(/-/g, '');
      const key = CacheUtils.KEY_PREFIX_NAME_HISTORY + cleanUUID;

      let result: object | string | null = null;
      let resultFromRedis = false;

      // Check if data is already cached in Redis
      if (this.redisReady && this.redisGet) {
        try {
          const redisResult = await this.redisGet(key);

          if (redisResult != null) {
            result = redisResult;
            resultFromRedis = true;
          }
        } catch (err) {
          console.error(err); // TODO: log error
        }
      }

      // If not cached in Redis, check if username is already know in the database
      if (!result && db.isAvailable()) {
        try {
          if (await db.isNameHistoryUpToDate(cleanUUID)) {
            const nameHistory = await db.getNameHistory(cleanUUID);

            // Make sure that the profile from the db is still accurate
            // by requesting the profile for that UUID
            // if the names match, we successfully avoided contacting the strictly rate-limited Name->UUID API-Route
            if (nameHistory) {
              const freshProfile = await this.getProfile(uuid);

              if (freshProfile?.name == nameHistory[0].name) {
                result = nameHistory;
              }
            }
          }
        } catch (err) {
          console.log(err); // TODO: log error
        }
      }

      // Requesting data from Mojang-API
      if (!result) {
        try {
          const nameHistory = await fetchNameHistory(uuid);

          result = nameHistory ? nameHistory : CacheUtils.EMPTY_VALUE;
        } catch (err) {
          console.log(err); // TODO: log error
        }
      }

      // Write to Redis cache
      if (!resultFromRedis && this.redisReady && this.redisSetEx) {
        if (result == CacheUtils.EMPTY_VALUE || result == null) {
          await this.redisSetEx(key, CacheUtils.CACHE_TIME_EMPTY, CacheUtils.EMPTY_VALUE);
        } else if (result == CacheUtils.ERR_VALUE) {
          await this.redisSetEx(key, CacheUtils.CACHE_DURATION, CacheUtils.ERR_VALUE);
        } else {
          await this.redisSetEx(key, CacheUtils.CACHE_DURATION, typeof result != 'string' ? JSON.stringify(result) : result);
        }
      }

      // Fulfill promise
      if (result == null || result == CacheUtils.ERR_VALUE) {
        return reject(new Error(`An error occurred while trying to get the Name-History for '${uuid}'`));
      } else if (result == CacheUtils.EMPTY_VALUE) {
        return resolve(null);
      } else {
        return resolve(typeof result == 'string' ? JSON.parse(result) : result);
      }
    });
  }

  public async getBlockedServers(): Promise<string[]> {
    return new Promise<string[]>(async (resolve, reject): Promise<void> => {
      let result: string[] | null = null;
      let resultFromRedis = false;

      // Check if data is already cached in Redis
      if (this.redisReady && this.redisGet) {
        try {
          const redisResult = await this.redisGet(CacheUtils.KEY_BLOCKED_SERVERS);

          if (redisResult != null) {
            result = JSON.parse(redisResult) as string[];
            resultFromRedis = true;
          }
        } catch (err) {
          console.error(err); // TODO: log error
        }
      }

      // TODO: store into db (hash, host, known_since, cracked_since)

      // Requesting data from Mojang-API
      if (!result) {
        try {
          result = await fetchBlockedServers();
        } catch (err) {
          console.log(err); // TODO: log error
        }
      }

      // Write to Redis cache
      if (!resultFromRedis && this.redisReady && this.redisSetEx) {
        await this.redisSetEx(CacheUtils.KEY_BLOCKED_SERVERS, CacheUtils.CACHE_DURATION_BLOCKED_SERVERS, JSON.stringify(result));
      }

      // Fulfill promise
      if (result == null) {
        return reject(new Error(`An error occurred while trying to get the list of blocked Minecraft servers`));
      }

      return resolve(result);
    });
  }

  public async isProfileInRedis(uuid: string): Promise<boolean> {
    return new Promise<boolean>(async (resolve, reject): Promise<void> => {
      // Check if data is already cached in Redis
      if (this.redisReady && this.redisGet) {
        try {
          const redisResult = await this.redisGet(CacheUtils.KEY_PREFIX_PROFILE + uuid.toLowerCase().replace(/-/g, ''));

          if (redisResult != null) {
            return resolve(true);
          }
        } catch (err) {
          console.error(err); // TODO: log error
        }
      }

      resolve(false);
    });
  }

  public async shutdown(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.redisClient.quit((err) => {
        if (err) return reject(err);

        return resolve();
      });
    });
  }
}