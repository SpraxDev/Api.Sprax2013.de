import { createVerify as cryptoCreateVerify } from 'crypto';
import { readFileSync } from 'fs';
import { join as joinPath } from 'path';

import { Cape, CapeType, MinecraftProfileTextureProperty, MinecraftUser, Skin, UserAgent } from '../global';
import { cache, db } from '../index';
import { ApiError, generateHash, Image } from './utils';
import { httpGet } from './web';

const yggdrasilPublicKey = readFileSync(joinPath(__dirname, '..', '..', 'resources', 'yggdrasil_session_pubkey.pem'));

export async function importByTexture(textureValue: string, textureSignature: string | null, userAgent: UserAgent): Promise<{ skin: Skin | null, cape: Cape | null }> {
  return new Promise((resolve, reject) => {
    const texture = MinecraftUser.extractMinecraftProfileTextureProperty(textureValue);
    const skinURL: string | undefined = texture.textures.SKIN?.url,
        capeURL: string | undefined = texture.textures.CAPE?.url;

    if (textureSignature && !isFromYggdrasil(textureValue, textureSignature)) {
      textureSignature = null;
    }

    let resultSkin: Skin | null = null,
        resultCape: Cape | null = null;

    let waitingFor = 0;
    const done = () => {
      waitingFor--;

      if (waitingFor == 0) {
        resolve({skin: resultSkin, cape: resultCape});

        // Request profile and insert latest version into db
        if (db.isAvailable() && !cache.isProfileInRedis(texture.profileId)) {
          // TODO: preserve User-Agent
          cache.getProfile(texture.profileId);
        }
      }
    };

    if (skinURL) {
      waitingFor++;

      importSkinByURL(MinecraftUser.getSecureURL(skinURL), userAgent, (err, skin) => {
        if (err || !skin) return reject(err);

        resultSkin = skin;
        done();
      }, textureValue, textureSignature);
    }

    if (capeURL) {
      waitingFor++;

      importCapeByURL(MinecraftUser.getSecureURL(capeURL), CapeType.MOJANG, userAgent, textureValue, textureSignature || undefined)
          .then((cape) => {
            resultCape = cape;
            done();
          })
          .catch((err) => {
            return reject(err);
          });
    }
  });
}

export function importSkinByURL(skinURL: string, userAgent: UserAgent, callback: (err: Error | null, skin: Skin | null, exactMatch: boolean) => void, textureValue: string | null = null, textureSignature: string | null = null): void {
  if (!skinURL.toLowerCase().startsWith('https://')) throw new Error(`skinURL(=${skinURL}) is not https`);

  httpGet(skinURL)
      .then((httpRes) => {
        if (httpRes.res.status != 200) return callback(new Error(`Importing skin by URL returned status ${httpRes.res.status}`), null, false);

        return importSkinByBuffer(httpRes.body, skinURL, userAgent, callback, textureValue, textureSignature);
      })
      .catch((err) => callback(err, null, false));
}

export function importSkinByBuffer(skinBuffer: Buffer, skinURL: string | null, userAgent: UserAgent, callback: (err: Error | null, skin: Skin | null, exactMatch: boolean) => void, textureValue: string | null = null, textureSignature: string | null = null, waitForAlternativeVersions: boolean = false): void {
  if (textureValue && textureSignature && !isFromYggdrasil(textureValue, textureSignature)) return callback(new Error('Texture signature is invalid!'), null, false);

  Image.fromImg(skinBuffer, (err, img) => {
    if (err || !img) return callback(err, null, false);

    img.toPngBuffer()
        .then((orgSkin) => {
          img.toCleanSkinBuffer()
              .then((cleanSkin) => {
                db.addSkin(orgSkin, cleanSkin, generateHash(img.img.data), skinURL, textureValue, textureSignature, userAgent)
                    .then((dbSkin) => {
                      if (textureValue && textureSignature) {
                        const json: MinecraftProfileTextureProperty = MinecraftUser.extractMinecraftProfileTextureProperty(textureValue);

                        cache.getProfile(json.profileId)
                            .then((profile) => {
                              if (!profile) return;

                              db.addSkinToUserHistory(profile.id, dbSkin.skin, new Date(json.timestamp))
                                  .catch((err) => {
                                    ApiError.log(`Could not update skin-history in database`, {
                                      skin: dbSkin.skin.id,
                                      profile: profile.id,
                                      stack: err.stack
                                    });
                                  });
                            })
                            .catch(console.error);
                      }

                      if (!waitForAlternativeVersions) {
                        callback(null, dbSkin.skin, dbSkin.exactMatch); // returning before starting background task
                      }

                      (async function () {
                        Image.fromImg(skinBuffer, async (err, img) => {
                          if (err || !img) return ApiError.log('Could not import alternative version for an skin', err);

                          const alternateVersions: Image[] = await img.generateSkinAlternatives();

                          for (const img of alternateVersions) {
                            try {
                              await db.addSkin(await img.toPngBuffer(), await img.toCleanSkinBuffer(),
                                  generateHash(img.img.data), null, null, null, userAgent);
                            } catch (err) {
                              ApiError.log('Could not import alternative version for an skin', err);
                            }
                          }

                          if (waitForAlternativeVersions) {
                            callback(null, dbSkin.skin, dbSkin.exactMatch);
                          }
                        });
                      })();
                    })
                    .catch((err) => callback(err, null, false));
              })
              .catch((err) => callback(err, null, false));
        })
        .catch((err) => callback(err, null, false));
  });
}

export function importCapeByURL(capeURL: string, capeType: CapeType, userAgent: UserAgent, textureValue?: string, textureSignature?: string): Promise<Cape | null> {
  return new Promise((resolve, reject) => {
    httpGet(capeURL)
        .then((httpRes) => {
          if (httpRes.res.status == 200) {
            Image.fromImg(httpRes.body, (err, img) => {
              if (err || !img) return reject(err);

              img.toPngBuffer()
                  .then((capePng) => {
                    db.addCape(capePng, generateHash(img.img.data), capeType, capeURL,
                        capeType == CapeType.MOJANG ? textureValue || null : null, capeType == CapeType.MOJANG ? textureSignature || null : null, userAgent)
                        .then((cape) => {
                          if (capeType == 'MOJANG' && textureValue && textureSignature) {
                            const json: MinecraftProfileTextureProperty = MinecraftUser.extractMinecraftProfileTextureProperty(textureValue);

                            cache.getProfile(json.profileId)
                                .then((profile) => {
                                  if (profile) {
                                    db.addCapeToUserHistory(profile.id, cape, new Date(json.timestamp))
                                        .catch((err) => {
                                          ApiError.log(`Could not update cape-history in database`, {
                                            profile: json.profileId,
                                            cape: cape.id,
                                            stack: err.stack
                                          });
                                        });
                                  }
                                });
                          }

                          return resolve(cape);
                        })
                        .catch(reject);
                  })
                  .catch(reject);
            });
          } else if (httpRes.res.status != 404) {
            reject(new Error(`Importing cape by URL returned status ${httpRes.res.status}`));
          } else {
            resolve(null);
          }
        })
        .catch(reject);
  });
}

function isFromYggdrasil(data: string, signature: string) {
  const ver = cryptoCreateVerify('sha1WithRSAEncryption');
  ver.update(data);

  return ver.verify(yggdrasilPublicKey, Buffer.from(signature, 'base64'));
}