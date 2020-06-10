import crypto = require('crypto');
import fs = require('fs');
import path = require('path');

import { Router } from 'express';

import { AiModel } from '../utils/ai_predict';
import { db } from '..';
import { ErrorBuilder, restful, Image, setCaching, isNumber, generateHash, ApiError } from '../utils/utils';
import { getUserAgent, getByUUID, isUUIDCached } from './minecraft';
import { MinecraftUser, UserAgent, Skin, Cape, CapeType, MinecraftProfileTextureProperty } from '../global';
import { getHttp } from '../utils/web';

const yggdrasilPublicKey = fs.readFileSync(path.join(__dirname, '..', '..', 'resources', 'yggdrasil_session_pubkey.pem'));

/* AI */

const AI_MODELS: { [key: string]: null | AiModel | Error } = {};

async function initAiModels() {
  const baseDir = path.join(__dirname, '..', '..', 'resources', 'ai_models');

  const aiModelDirs = fs.readdirSync(baseDir, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);

  // Set to null as soon as possible, so when a requst comes in it does not responde with an 'unknown model'
  for (const dirName of aiModelDirs) {
    AI_MODELS[dirName.toUpperCase()] = null;
  }

  new Promise((resolve) => {
    let i = 0;

    for (const dirName of aiModelDirs) {
      const dirPath = path.join(baseDir, dirName);
      const aiKey = dirName.toUpperCase();

      if (AI_MODELS[aiKey] != null) {
        console.log('Found another AI-Model directory that has already been loaded:', dirPath);
        continue;
      }

      try {
        const model = new AiModel(dirPath);

        i++;
        model.init()
          .then(() => AI_MODELS[aiKey] = model)
          .catch((err) => { throw err; })
          .finally(() => {
            if (--i == 0) {
              resolve();
            }
          });
      } catch (err) {
        AI_MODELS[aiKey] = err;

        console.error(`Could not load AI-Model '${dirName}': ${err instanceof Error ? err.message : err}`);
      }
    }
  });
}
initAiModels();

/* Routes */
const router = Router();
export const skindbExpressRouter = router;

router.all('/import', (req, res, next) => {
  // user (uuid, name), texture-value (+signature), file(s), URL

  restful(req, res, {
    post: () => {
      const contentType = (req.headers['content-type'] || '').toLowerCase();

      if (contentType == 'image/png') {
        if (!(req.body instanceof Buffer)) return next(new ErrorBuilder().invalidBody([{ param: 'body', condition: 'Valid png under 3MB' }]));

        Image.fromImg(req.body, (err, img) => {
          if (err || !img) return next(new ErrorBuilder().invalidBody([{ param: 'body', condition: 'Valid png' }]));
          if (!img.hasSkinDimensions()) return next(new ErrorBuilder().invalidBody([{ param: 'body', condition: 'Valid minecraft skin dimensions 64x32px or 64x64px' }]));

          getUserAgent(req, (err, userAgent) => {
            if (err || !userAgent) return next(err || new ErrorBuilder().serverErr(undefined, `Could not fetch User-Agent`));

            importSkinByBuffer(req.body, null, userAgent, (err, skin, exactMatch) => {
              if (err || !skin) return next(err || new ErrorBuilder().serverErr(undefined, `Could not import uploaded skin by Buffer`));

              return setCaching(res, false, false)
                .status(exactMatch ? 200 : 201)
                .send({
                  result: exactMatch ? 'Skin already in database' : 'Skin added to database',
                  skinID: skin.id
                });
            });
          });
        });
      } else if (contentType == 'application/json') {
        const json: { url?: string, raw?: { value: string, signature?: string } } = req.body;

        if (json.raw) {
          if (!json.raw.value) return next(new ErrorBuilder().invalidBody([{ param: 'JSON-Body: json.raw.value', condition: 'Valid skin value from mojang profile' }]));
          if (json.raw.signature && !isFromYggdrasil(json.raw.value, json.raw.signature)) json.raw.signature = undefined;

          getUserAgent(req, (err, userAgent) => {
            if (err || !userAgent) return next(err || new ErrorBuilder().serverErr(undefined, `Could not fetch User-Agent`));
            if (!json.raw) return next(new ErrorBuilder().unknown());  // FIXME: why does TypeScript need this line? o.0

            importByTexture(json.raw.value, json.raw.signature || null, userAgent)
              .then((result) => {
                return setCaching(res, false, false)
                  .status(202) // TODO report if skin added to db or already was in db
                  .send({
                    result: null, // TODO report if skin added to db or already was in db
                    skinID: result.skin?.id
                  });
              })
              .catch((err) => {
                next(err)
              });
          });
        } else if (json.url) {
          if (!MinecraftUser.getSecureURL(json.url).toLowerCase().startsWith('https://textures.minecraft.net/texture/'))
            return next(new ErrorBuilder().invalidBody([{ param: 'JSON-Body: json.url', condition: 'Valid textures.minecraft.net URL' }]));

          getUserAgent(req, (err, userAgent) => {
            if (err || !userAgent) return next(err || new ErrorBuilder().serverErr(undefined, `Could not fetch User-Agent`));
            if (!json.url) return next(new ErrorBuilder().unknown());  // FIXME: why does TypeScript need this line? o.0

            importSkinByURL(MinecraftUser.getSecureURL(json.url), userAgent, (err, skin, exactMatch) => {
              if (err || !skin) return next(err || new ErrorBuilder().serverErr(undefined, `Could not import uploaded skin-URL`));

              return setCaching(res, false, false)
                .status(exactMatch ? 200 : 201)
                .send({
                  result: exactMatch ? 'Skin already in database' : 'Skin added to database',
                  skinID: skin.id
                });
            })
          });
        } else {
          return next(new ErrorBuilder().invalidBody([]));  //TODO
        }
      } else {
        return next(new ErrorBuilder().invalidBody([]));  //TODO
      }
    }
  });
});

router.use('/cdn/skins/:id?/:type?', (req, res, next) => {
  if (req.params.id && req.params.id.endsWith('.png')) {
    req.params.id = req.params.id.substring(0, req.params.id.length - 4);
  }

  if (!req.params.id || !isNumber(req.params.id.trim())) return next(new ErrorBuilder().invalidParams('url', [{ param: 'id', condition: 'Is numeric string (0-9)' }]));

  if (req.params.type && req.params.type.trim().toLowerCase() != 'original.png' && req.params.type.trim().toLowerCase() != 'clean.png') return next(new ErrorBuilder().invalidParams('url', [{ param: 'type', condition: 'Empty or equal (ignore case) one of the following: original.png, clean.png' }]))

  const id = req.params.id.trim();
  const originalType = req.params.type && req.params.type.trim().toLowerCase() == 'original.png';

  db.getSkin(id)
    .then((skin) => {
      if (!skin) return next(new ErrorBuilder().notFound('Skin for given ID'));

      db.getSkinImage(skin.duplicateOf || skin.id, originalType ? 'original' : 'clean', (err, img) => {
        if (err) return next(err);
        if (!img) return next(new ErrorBuilder().serverErr(`Could not find any image in db for skin (id=${skin.id})`, true));

        setCaching(res, true, true, 60 * 60 * 24 * 30 /*30d*/)
          .type('png')
          .send(img);
      });
    })
    .catch((err) => {
      next(err);
    });
});

router.use('/cdn/capes/:id?', (req, res, next) => {
  if (req.params.id && req.params.id.endsWith('.png')) {
    req.params.id = req.params.id.substring(0, req.params.id.length - 4);
  }

  if (!req.params.id || !isNumber(req.params.id.trim())) return next(new ErrorBuilder().invalidParams('url', [{ param: 'id', condition: 'Is numeric string (0-9)' }]));

  const id = req.params.id.trim();

  db.getCape(id, (err, cape) => {
    if (err) return next(err);
    if (!cape) return next(new ErrorBuilder().notFound('Cape for given ID'));

    db.getCapeImage(cape.duplicateOf || cape.id, (err, img) => {
      if (err) return next(err);
      if (!img) return next(new ErrorBuilder().serverErr(`Could not find any image in db for cape (id=${cape.id})`, true));

      setCaching(res, true, true, 60 * 60 * 24 * 30 /*30d*/)
        .type('png')
        .send(img);
    });
  });
});

// router.all('/search', (req, res, next) => {
//   // Currently supported: user (uuid, name)

//   restful(req, res, {
//     get: () => {
//       if (typeof req.query.q != 'string') return next(new ErrorBuilder().invalidParams('query', [{ param: 'q', condition: 'Is string' }]));
//       if (!req.query.q || req.query.q.trim() <= 128) return next(new ErrorBuilder().invalidParams('query', [{ param: 'q', condition: 'q.length > 0 and q.length <= 128' }]));

//       const query: string = req.query.q.trim();
//       let waitingFor = 0;

//       const result: { profiles?: { direct?: CleanMinecraftUser[], indirect?: CleanMinecraftUser[] } } = {};

//       const sendResponse = (): void => {
//         if (waitingFor == 0) {
//           res.send(result);
//         }
//       };

//       if (query.length <= 16) {
//         waitingFor++;

//         getByUsername(query, null, (err, apiRes) => {
//           if (err) ApiError.log(`Searching by username for ${query} failed`, err);

//           if (apiRes) {
//             getByUUID(apiRes.id, req, (err, mcUser) => {
//               if (err) ApiError.log(`Searching by username for ${query} failed`, err);

//               if (mcUser) {
//                 if (!result.profiles) result.profiles = {};
//                 if (!result.profiles.direct) result.profiles.direct = [];

//                 result.profiles.direct.push(mcUser.toCleanJSON());
//               }

//               waitingFor--;
//               sendResponse();
//             });
//           } else {
//             waitingFor--;

//             if (waitingFor == 0) {
//               res.send(result);
//             }
//           }
//         });
//       } else if (isUUID(query)) {
//         waitingFor++;

//         getByUUID(query, req, (err, mcUser) => {
//           if (err) ApiError.log(`Searching by uuid for ${query} failed`, err);

//           if (mcUser) {
//             if (!result.profiles) result.profiles = {};
//             if (!result.profiles.direct) result.profiles.direct = [];

//             result.profiles.direct.push(mcUser.toCleanJSON());
//           }

//           waitingFor--;
//           sendResponse();
//         });
//       }

//       sendResponse();
//     }
//   });
// });

router.all('/ai/:model?', async (req, res, next) => {
  restful(req, res, {
    get: () => {
      if (!req.params.model || !AI_MODELS.hasOwnProperty(req.params.model.toUpperCase())) return next(new ErrorBuilder().invalidParams('url', [{ param: 'model', condition: `Equal (ignore case) one of the following: ${Object.keys(AI_MODELS).join('", "')}` }]));

      const querySkinID = req.query.skin;

      if (!req.query.skin) return next(new ErrorBuilder().invalidParams('query', [{ param: 'skin', condition: 'skin.length > 0' }]));
      if (typeof querySkinID != 'string' || !isNumber(querySkinID)) return next(new ErrorBuilder().invalidParams('query', [{ param: 'skin', condition: 'Is numeric string (0-9)' }]));

      const model = AI_MODELS[req.params.model.toUpperCase()];

      if (!model) {
        res.set('Retry-After', '2');
        return next(new ErrorBuilder().serviceUnavailable('This AI model is still being initialized'));
      } else if (model instanceof Error) {
        return next(new ErrorBuilder().serviceUnavailable('The requested AI model failed to initialize'));
      }

      db.getSkinImage(querySkinID, 'clean', (err, skin) => {
        if (err) return next(err);
        if (!skin) return next(new ErrorBuilder().serverErr(`Could not find any image in db for skin (id=${querySkinID})`, true));

        model.predict(skin)
          .then((result) => {
            return res.send(result);
          })
          .catch(next);
      });
    }
  });
});

/* Helper */
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
        resolve({ skin: resultSkin, cape: resultCape });

        // Request profile and insert latest version into db
        // If it is already cached, it is in the database for sure! We don't want any recursive endless-loop!
        if (db.isAvailable() && !isUUIDCached(texture.profileId)) {
          getByUUID(texture.profileId, null, () => { });  // TODO: preserve User-Agent
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

  getHttp(skinURL, false)
    .then((httpRes) => {
      if (httpRes.res.statusCode != 200) return callback(new Error(`Importing skin by URL returned status ${httpRes.res.statusCode}`), null, false);

      return importSkinByBuffer(httpRes.body, skinURL, userAgent, callback, textureValue, textureSignature);
    })
    .catch((err) => callback(err, null, false));
}

export function importSkinByBuffer(skinBuffer: Buffer, skinURL: string | null, userAgent: UserAgent, callback: (err: Error | null, skin: Skin | null, exactMatch: boolean) => void, textureValue: string | null = null, textureSignature: string | null = null): void {
  if (textureValue && textureSignature && !isFromYggdrasil(textureValue, textureSignature)) return callback(new Error('Texture signature is invalid!'), null, false);

  Image.fromImg(skinBuffer, (err, img) => {
    if (err || !img) return callback(err, null, false);

    img.toPngBuffer((err, orgSkin) => {
      if (err || !orgSkin) return callback(err, null, false);

      img.toCleanSkinBuffer((err, cleanSkin) => {
        if (err || !cleanSkin) return callback(err, null, false);

        db.addSkin(orgSkin, cleanSkin, generateHash(cleanSkin), skinURL, textureValue, textureSignature, userAgent, (err, skin, exactMatch) => {
          if (err || !skin) return callback(err, null, false);

          if (textureValue && textureSignature) {
            const json: MinecraftProfileTextureProperty = MinecraftUser.extractMinecraftProfileTextureProperty(textureValue);
            getByUUID(json.profileId, null, (err, user) => {
              if (err || !user) return;  // Error or invalid uuid

              db.addSkinToUserHistory(user, skin, new Date(json.timestamp))
                .catch((err) => ApiError.log(`Could not update skin-history in database`, { skin: skin.id, profile: user.id, stack: err.stack }));
            });
          }

          callback(null, skin, exactMatch); // returning before starting background task

          (async function () {
            Image.fromImg(skinBuffer, async (err, img) => {
              if (err || !img) return ApiError.log('Could not import alternative version for an skin', err);

              const alternateVersions: Image[] = await img.generateSkinAlternatives();

              for (const img of alternateVersions) {
                img.toPngBuffer((err, orgSkin) => {
                  if (err || !orgSkin) return ApiError.log('Could not import alternative version for an skin', err);

                  img.toCleanSkinBuffer((err, cleanSkin) => {
                    if (err || !cleanSkin) return ApiError.log('Could not import alternative version for an skin', err);

                    db.addSkin(orgSkin, cleanSkin, generateHash(cleanSkin), null, null, null, userAgent, (err, _exactMatch) => {
                      if (err) return ApiError.log('Could not import alternative version for an skin', err);
                    });
                  });
                });
              }
            });
          })();
        });
      });
    });
  });
}

export function importCapeByURL(capeURL: string, capeType: CapeType, userAgent: UserAgent, textureValue?: string, textureSignature?: string): Promise<Cape | null> {
  return new Promise((resolve, reject) => {
    getHttp(capeURL, false)
      .then((httpRes) => {
        if (httpRes.res.statusCode == 200) {
          Image.fromImg(httpRes.body, (err, img) => {
            if (err || !img) return reject(err);

            img.toPngBuffer((err, capePng) => {
              if (err || !capePng) return reject(err);

              db.addCape(capePng, generateHash(capePng), capeType, capeURL, capeType == CapeType.MOJANG ? textureValue || null : null, capeType == CapeType.MOJANG ? textureSignature || null : null, userAgent, (err, cape) => {
                if (err || !cape) return reject(err);

                db.addCape(capePng, generateHash(capePng), capeType, capeURL, capeType == CapeType.MOJANG ? textureValue || null : null, capeType == CapeType.MOJANG ? textureSignature || null : null, userAgent, (err, cape) => {
                  if (err || !cape) return reject(err);

                  if (capeType == 'MOJANG' && textureValue && textureSignature) {
                    const json: MinecraftProfileTextureProperty = MinecraftUser.extractMinecraftProfileTextureProperty(textureValue);
                    getByUUID(json.profileId, null, (err, user) => {
                      if (err || !user) return;  // Error or invalid uuid

                      db.addCapeToUserHistory(user, cape, new Date(json.timestamp))
                        .catch((err) => ApiError.log(`Could not update cape-history in database`, { profile: json.profileId, cape: cape.id, stack: err.stack }));
                    });
                  }

                  return resolve(cape);
                });
              });
            });
          });
        } else if (httpRes.res.statusCode != 404) {
          reject(new Error(`Importing cape by URL returned status ${httpRes.res.statusCode}`));
        } else {
          resolve(null);
        }
      })
      .catch(reject);
  });
}

function isFromYggdrasil(data: string, signature: string) {
  const ver = crypto.createVerify('sha1WithRSAEncryption');
  ver.update(data);

  return ver.verify(yggdrasilPublicKey, Buffer.from(signature, 'base64'));
}