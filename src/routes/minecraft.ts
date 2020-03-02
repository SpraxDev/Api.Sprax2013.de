import request = require('request');
import fs = require('fs');
import nCache = require('node-cache');
import { Router, Request } from 'express';
import { restful, isUUID, toBoolean, Image, ErrorBuilder, ApiError, HttpError } from '../utils';
import { MinecraftProfile, MinecraftUser, MinecraftNameHistoryElement, UserAgent, CapeType } from '../global';
import { db } from '../index';

const uuidCache = new nCache({ stdTTL: 62, useClones: false }), /* key:${name_lower};${at||''}, value: { id: string, name: string } | Error | null */
  userCache = new nCache({ stdTTL: 62, useClones: false }), /* key: profile.id, value: MinecraftUser | Error | null */
  userAgentCache = new nCache({ stdTTL: 10 * 60, useClones: false }) /* key: ${userAgent};${internal(boolean)}, value: UserAgent */;

userCache.on('set', async (_key: string, value: MinecraftUser | Error | null) => {
  if (value instanceof MinecraftUser) {
    db.updateUser(value, (err) => {
      if (err) return ApiError.log('Could not update user in database', { profile: value.id, stack: err.stack });

      /* Skin */
      const skinURL = value.getSecureSkinURL();
      if (skinURL) {
        request.get(skinURL, { encoding: null }, (err, httpRes, httpBody) => {
          if (err) return ApiError.log(`Could not fetch skinURL`, { skinURL, stack: err.stack });

          if (httpRes.statusCode == 200) {
            Image.fromImg(httpBody, (err, img) => {
              if (err || !img) return ApiError.log('Could not create image from skin-Buffer', { skinURL, textureValue: value.textureValue, textureSignature: value.textureSignature, stack: err ? err.stack : new Error().stack });

              img.toPngBuffer((err, orgSkin) => {
                if (err || !orgSkin) return ApiError.log('Could not create png-Buffer from image', { skinURL, textureValue: value.textureValue, textureSignature: value.textureSignature, stack: err ? err.stack : new Error().stack });

                img.toCleanSkin((err, cleanSkin) => {
                  if (err || !cleanSkin) return ApiError.log('Could not create cleanSkin-Buffer from image', { skinURL, textureValue: value.textureValue, textureSignature: value.textureSignature, stack: err ? err.stack : new Error().stack });

                  db.addSkin(orgSkin, cleanSkin, skinURL, value.textureValue, value.textureSignature, value.userAgent, (err, skin) => {
                    if (err || !skin) return ApiError.log('Could not update skin in database', { skinURL, textureValue: value.textureValue, textureSignature: value.textureSignature, stack: err ? err.stack : new Error().stack });

                    db.addSkinToUserHistory(value, skin, (err) => {
                      if (err) return ApiError.log(`Could not update skin-history in database`, { skin: skin.id, profile: value.id, stack: err.stack });
                    });
                  });
                });
              });
            });
          }
        });
      }

      const processCape = function (capeURL: string | null, capeType: CapeType) {
        if (capeURL) {
          request.get(capeURL, { encoding: null }, (err, httpRes, httpBody) => {
            if (err) return ApiError.log(`Could not fetch capeURL`, { capeURL, stack: err.stack });

            if (httpRes.statusCode == 200) {
              Image.fromImg(httpBody, (err, img) => {
                if (err || !img) return ApiError.log('Could not create image from cape-Buffer', { capeURL, textureValue: value.textureValue, textureSignature: value.textureSignature, stack: err ? err.stack : new Error().stack });

                img.toPngBuffer((err, capePng) => {
                  if (err || !capePng) return ApiError.log('Could not create png-Buffer from image', { capeURL, textureValue: value.textureValue, textureSignature: value.textureSignature, stack: err ? err.stack : new Error().stack });

                  db.addCape(capePng, capeType, capeURL, value.textureValue, value.textureSignature, value.userAgent, (err, cape) => {
                    if (err || !cape) return ApiError.log('Could not update cape in database', { capeURL, textureValue: value.textureValue, textureSignature: value.textureSignature, stack: err ? err.stack : new Error().stack });

                    db.addCapeToUserHistory(value, cape, (err) => {
                      if (err) return ApiError.log(`Could not update cape-history in database`, { cape: cape.id, profile: value.id, stack: err.stack });
                    });
                  });
                });
              });
            }
          });
        }
      };

      /* Capes */
      processCape(value.getSecureCapeURL(), CapeType.MOJANG);
      processCape(value.getOptiFineCapeURL(), CapeType.OPTIFINE);
      processCape(value.getLabyModCapeURL(), CapeType.LABY_MOD);
    });
  }
});

const SKIN_STEVE = fs.readFileSync('./resources/steve.png'),
  SKIN_ALEX = fs.readFileSync('./resources/alex.png');

const router = Router();
export const minecraftExpressRouter = router;

// Turn :user into uuid (without hyphenes)
router.param('user', (req, res, next, value, name) => {
  if (typeof value != 'string') return next(new ErrorBuilder().invalidParams('url', [{ param: 'user', condition: 'Is string' }]));

  if (value.length <= 16) {
    let at: string | null = null;
    if (req.query.at) {
      if (!(/^\d+$/.test(req.query.at))) return next(new ErrorBuilder().invalidParams('query', [{ param: 'at', condition: 'Is numeric string (0-9)' }]));
      at = req.query.at;
    }

    getByUsername(value, at, (err, apiRes) => {
      if (err) return next(err);
      if (!apiRes) return next(new ErrorBuilder().notFound('UUID for given username'));

      getByUUID(apiRes.id, req, (err, mcUser) => {
        if (err) return next(err);
        if (!mcUser) return next(new ErrorBuilder().notFound('Profile for given username'));

        req.params[name] = mcUser.id;
        return next();
      });
    });
  } else if (isUUID(value)) {
    getByUUID(value, req, (err, mcUser) => {
      if (err) return next(err);
      if (!mcUser) return next(new ErrorBuilder().invalidParams('url', [{ param: 'user', condition: 'Profile for given UUID' }]));

      req.params[name] = mcUser.id;
      return next();
    });
  } else {
    return next(new ErrorBuilder().invalidParams('url', [{ param: 'user', condition: 'Is valid uuid string or user.length <= 16' }]));
  }
});

router.param('capeType', (req, res, next, value, name) => {
  if (typeof value != 'string') return next(new ErrorBuilder().invalidParams('url', [{ param: 'capeType', condition: 'Is string' }]));

  let capeType: string | null = null;

  for (const key in CapeType) {
    if (key == value.toUpperCase()) {
      capeType = key;
      break;
    }
  }

  if (!capeType) return next(new ErrorBuilder().invalidParams('url', [{ param: 'capeType', condition: `capeType equals (ignore case) one of the following: ${Object.keys(CapeType).join(', ')}` }]));

  req.params[name] = capeType;
  next();
});

/* Account Routes */
router.all('/profile/:user?', (req, res, next) => {
  restful(req, res, {
    get: () => {
      if (!req.params.user) return next(new ErrorBuilder().invalidParams('url', [{ param: 'user', condition: 'user.length > 0' }]));
      const raw = typeof req.query.raw == 'string' ? toBoolean(req.query.raw) : true;

      getByUUID(req.params.user, req, (err, mcUser) => {
        if (err) return next(err);
        if (!mcUser) return next(new ErrorBuilder().notFound('Profile for given user', true));

        return res.send(raw ? mcUser.toOriginal() : mcUser.toCleanJSON());
      });
    }
  });
});

router.all('/uuid/:name?', (req, res, next) => {
  restful(req, res, {
    get: () => {
      if (!req.params.name) return next(new ErrorBuilder().invalidParams('url', [{ param: 'name', condition: 'name.length > 0' }]));

      let at;
      if (req.query.at) {
        if (!(/^\d+$/.test(req.query.at))) return next(new ErrorBuilder().invalidParams('query', [{ param: 'at', condition: 'Is numeric string (0-9)' }]));
        at = req.query.at;
      }

      getByUsername(req.params.name, at, (err, apiRes) => {
        if (err) return next(err);
        if (!apiRes) return next(new ErrorBuilder().notFound('Profile for given user', true));

        res.send(apiRes);
      });
    }
  });
});

router.all('/history/:user?', (req, res, next) => {
  restful(req, res, {
    get: () => {
      if (!req.params.user) return next(new ErrorBuilder().invalidParams('url', [{ param: 'user', condition: 'user.length > 0' }]));

      getByUUID(req.params.user, req, (err, mcUser) => {
        if (err) return next(err);
        if (!mcUser) return next(new ErrorBuilder().notFound('Profile for given user', true));
        if (!mcUser.nameHistory) return next(new ErrorBuilder().notFound('Name history for given user', true));

        res.send(mcUser.nameHistory);
      });
    }
  });
});

/* Skin Routes */
// TODO Skin renders anbieten (head, body, front, 3d, ...)
router.all('/skin/:user?', (req, res, next) => {
  restful(req, res, {
    get: () => {
      if (!req.params.user) return next(new ErrorBuilder().invalidParams('url', [{ param: 'user', condition: 'user.length > 0' }]));

      const raw = typeof req.query.raw == 'string' ? toBoolean(req.query.raw) : false;
      const download = typeof req.query.download == 'string' ? toBoolean(req.query.download) : false;
      const mimeType = download ? 'application/octet-stream' : 'png';

      getByUUID(req.params.user, req, (err, mcUser) => {
        if (err) return next(err);
        if (!mcUser) return next(new ErrorBuilder().notFound('Profile for given user', true));

        const skinURL = mcUser.getSecureSkinURL();

        if (skinURL) {
          request.get(skinURL, { encoding: null }, (err, httpRes, httpBody) => {
            if (err) return next(err);

            if (httpRes.statusCode == 200) {
              if (raw) {
                res.type(mimeType);
                if (download) {
                  res.set('Content-Disposition', `attachment;filename=${mcUser.name}.png`);
                }

                res.send(httpBody);
              } else {
                Image.fromImg(httpBody, (err, img) => {
                  if (err || !img) return next(err);

                  img.toCleanSkin((err, png) => {
                    if (err) return next(err);

                    res.type(mimeType);
                    if (download) {
                      res.set('Content-Disposition', `attachment;filename=${mcUser.name}.png`);
                    }

                    res.send(png);
                  });
                });
              }
            } else {
              if (httpRes.statusCode != 404) ApiError.log(`${mcUser.skinURL} returned HTTP-Code ${httpRes.statusCode}`);

              res.type(mimeType);
              if (download) {
                res.set('Content-Disposition', `attachment;filename=${mcUser.name}.png`);
              }

              res.send(mcUser.isAlexDefaultSkin() ? SKIN_ALEX : SKIN_STEVE);
            }
          });
        } else {
          res.type(mimeType);
          if (download) {
            res.set('Content-Disposition', `attachment;filename=${mcUser.name}.png`);
          }

          res.send(mcUser.isAlexDefaultSkin() ? SKIN_ALEX : SKIN_STEVE);
        }
      });
    }
  });
});

/* Cape Routes */
router.all('/capes/:capeType/:user?', (req, res, next) => {
  restful(req, res, {
    get: () => {
      if (!req.params.user) return next(new ErrorBuilder().invalidParams('url', [{ param: 'user', condition: 'user.length > 0' }]));

      const download = typeof req.query.download == 'string' ? toBoolean(req.query.download) : false;
      const mimeType = download ? 'application/octet-stream' : 'png';

      getByUUID(req.params.user, req, (err, mcUser) => {
        if (err) return next(err);
        if (!mcUser) return next(new ErrorBuilder().notFound('Profile for given user', true));

        const capeType = req.params.capeType as CapeType;
        const capeURL = capeType == CapeType.MOJANG ? mcUser.getSecureCapeURL() :
          capeType == CapeType.OPTIFINE ? mcUser.getOptiFineCapeURL() :
            capeType == CapeType.LABY_MOD ? mcUser.getLabyModCapeURL() : null;

        if (capeURL) {
          request.get(capeURL, { encoding: null }, (err, httpRes, httpBody) => {
            if (err) return next(err);

            if (httpRes.statusCode == 200) {
              res.type(mimeType);
              if (download) {
                res.set('Content-Disposition', `attachment;filename=${mcUser.name}.png`);
              }

              res.send(httpBody);
            } else {
              if (httpRes.statusCode != 404) ApiError.log(`${mcUser.skinURL} returned HTTP-Code ${httpRes.statusCode}`);

              return next(new ErrorBuilder().notFound());
            }
          });
        } else {
          return next(new ErrorBuilder().notFound('CapeURL for given CapeType', true));
        }
      });
    }
  });
});

/* Server Routes */
router.all('/servers/blocked', (req, res, next) => {  // TODO: return object (key: hash, value: 'known host' | null) with query param to only return array
  restful(req, res, {
    get: () => {
      getBlockedServers((err, hashes) => {
        if (err) return next(err);
        if (!hashes) return next(new ErrorBuilder().notFound('List of blocked servers', true));

        res.send(hashes);
      });
    }
  });
});

/* Helper */
function getByUsername(username: string, at: number | string | null, callback: (err: Error | null, apiRes: { id: string, name: string } | null) => void): void {
  if (typeof at != 'number' || (typeof at == 'number' && at > Date.now())) {
    at = null;
  }

  const cacheKey = `${username.toLowerCase()};${at != null ? at : ''}`;
  const cacheValue: { id: string, name: string } | Error | null | undefined = uuidCache.get(cacheKey);
  if (cacheValue == undefined) {
    request.get(`https://api.mojang.com/users/profiles/minecraft/${username}${at != null ? `?at=${at}` : ''}`, {}, (err, httpRes, httpBody) => {
      if (err) {
        uuidCache.set(cacheKey, err);
        return callback(err, null);
      }

      if (httpRes.statusCode != 200 && httpRes.statusCode != 204) {
        ApiError.log(`Mojang returned ${httpRes.statusCode} on uuid lookup for ${username}(at=${at || 'null'})`);

        if (at != null) return callback(err || new ErrorBuilder().serverErr('The server got rejected with status 429', true), null); // Currently no fallback available accepting at-param

        // Contact fallback api (should not be necessary but is better than returning an 429 or 500)
        request.get(`https://api.ashcon.app/mojang/v1/user/${username}`, {}, (err, httpRes, httpBody) => {
          if (err || (httpRes.statusCode != 200 && httpRes.statusCode != 404)) {
            return callback(err || new ErrorBuilder().serverErr(`The server got rejected (${HttpError.getName(httpRes.statusCode) || httpRes.statusCode})`), null);
          }
          if (httpRes.statusCode == 404) return callback(null, null);

          const json = JSON.parse(httpBody);
          const apiRes = { id: json.uuid.replace(/-/g, ''), name: json.username };
          uuidCache.set(cacheKey, apiRes, 10);  // TODO cache 404 and err
          return callback(null, apiRes);
        });
      } else {
        const apiRes = httpRes.statusCode == 200 ? JSON.parse(httpBody) : null;
        uuidCache.set(cacheKey, apiRes);

        callback(null, apiRes); // Not Found or Success
      }
    });
  } else {
    if (!cacheValue) return callback(null, null); // Not Found
    if (cacheValue instanceof Error) return callback(cacheValue, null); // Error

    return callback(null, cacheValue); // Hit cache
  }
}

function getByUUID(uuid: string, req: Request, callback: (err: Error | null, user: MinecraftUser | null) => void): void {
  const cacheKey = uuid.toLowerCase();
  const cacheValue: MinecraftUser | Error | null | undefined = userCache.get(cacheKey);

  if (cacheValue == undefined) {
    const getNameHistory = function (mcUser: MinecraftProfile | null, callback: (err: Error | null, nameHistory: MinecraftNameHistoryElement[] | null) => void): void {
      if (!mcUser) return callback(null, null);

      request.get(`https://api.mojang.com/user/profiles/${mcUser.id}/names`, {}, (err, httpRes, httpBody) => {
        if (err) return callback(err, null);

        if (httpRes.statusCode != 200 && httpRes.statusCode != 204) {
          ApiError.log(`Mojang returned ${httpRes.statusCode} on name history lookup for ${mcUser.id}`);

          // Contact fallback api (should not be necessary but is better than returning an 429 or 500
          request.get(`https://api.ashcon.app/mojang/v2/user/${mcUser.id}`, {}, (err, httpRes, httpBody) => {  // FIXME: This api never returns legacy-field
            if (err || (httpRes.statusCode != 200 && httpRes.statusCode != 404)) {
              return callback(err || new ErrorBuilder().serverErr(`The server got rejected (${HttpError.getName(httpRes.statusCode) || httpRes.statusCode})`, true), null);
            }
            if (httpRes.statusCode == 404) return callback(null, null);

            const result: MinecraftNameHistoryElement[] = [];
            for (const elem of JSON.parse(httpBody).username_history) {
              result.push({
                name: elem.username,
                changedToAt: elem.changed_at ? new Date(elem.changed_at).getTime() : undefined
              });
            }

            return callback(null, result);
          });
        } else {
          const result: MinecraftNameHistoryElement[] = [];

          if (httpRes.statusCode == 200) {
            for (const elem of JSON.parse(httpBody)) {
              result.push({
                name: elem.name,
                changedToAt: elem.changedToAt
              });
            }
          }

          return callback(null, result);
        }
      });
    };

    request.get(`https://sessionserver.mojang.com/session/minecraft/profile/${uuid}?unsigned=false`, {}, (err, httpRes, httpBody) => {
      if (err) {
        userCache.set(cacheKey, err);
        return callback(err, null);
      }

      if (httpRes.statusCode != 200 && httpRes.statusCode != 204) {
        ApiError.log(`Mojang returned ${httpRes.statusCode} on profile lookup for ${uuid}`);

        // Contact fallback api (should not be necessary but is better than returning an 429 or 500
        request.get(`https://api.ashcon.app/mojang/v2/user/${uuid}`, {}, (err, httpRes, httpBody) => {  // FIXME: This api never returns legacy-field
          if (err || (httpRes.statusCode != 200 && httpRes.statusCode != 404)) {
            return callback(err || new ErrorBuilder().serverErr(`The server got rejected (${HttpError.getName(httpRes.statusCode) || httpRes.statusCode})`, true), null);
          }
          if (httpRes.statusCode == 404) return callback(null, null);

          const json = JSON.parse(httpBody);

          const nameHistory: MinecraftNameHistoryElement[] = [];
          for (const elem of JSON.parse(httpBody).username_history) {
            nameHistory.push({
              name: elem.username,
              changedToAt: elem.changed_at ? new Date(elem.changed_at).getTime() : undefined
            });
          }

          getUserAgent(req, (err, userAgent) => {
            if (err || !userAgent) return callback(err || new ErrorBuilder().serverErr(undefined, `Could not fetch User-Agent`), null);

            const mcUser: MinecraftUser = new MinecraftUser({
              id: json.uuid.replace(/-/g, ''),
              name: json.username,
              properties: [
                {
                  name: 'textures',
                  value: json.textures.raw.value,
                  signature: json.textures.raw.signature
                }
              ]
            }, nameHistory, userAgent);

            // TODO cache 404 and err
            uuidCache.set(`${mcUser.name.toLowerCase()};`, { id: mcUser.id, name: mcUser.name }, 10);
            userCache.set(cacheKey, mcUser, 10);

            return callback(null, mcUser); // Success
          });
        });
      } else {
        const profile: MinecraftProfile | null = httpRes.statusCode == 200 ? JSON.parse(httpBody) : null;

        getNameHistory(profile, (err, nameHistory) => {
          if (err) return callback(err, null); // Error

          getUserAgent(req, (err, userAgent) => {
            if (err || !userAgent) return callback(err || new ErrorBuilder().serverErr(undefined, `Could not fetch User-Agent`), null);

            const mcUser = profile && nameHistory ? new MinecraftUser(profile, nameHistory, userAgent, true) : null;

            if (mcUser) {
              uuidCache.set(`${mcUser.name.toLowerCase()};`, { id: mcUser.id, name: mcUser.name });
            }

            userCache.set(cacheKey, err || mcUser);
            return callback(err || null, mcUser); // Error, Not Found or Success
          });
        });
      }
    });
  } else {
    if (!cacheValue) return callback(null, null); // Not Found
    if (cacheValue instanceof Error) return callback(cacheValue, null); // Error

    return callback(null, cacheValue); // Hit cache
  }
}

function getBlockedServers(callback: (err: Error | null, hashes: string[] | null) => void): void {
  request.get(`https://sessionserver.mojang.com/blockedservers`, {}, (err, httpRes, httpBody) => {
    if (err) return callback(err, null);
    if (httpRes.statusCode != 200) return callback(null, null);

    let hashes = [];

    for (const hash of httpBody.split('\n')) {
      hashes.push(hash);
    }

    if (hashes[hashes.length - 1].trim() == '') {
      hashes.pop();
    }

    callback(null, hashes);
  });
}

function getUserAgent(req: Request, callback: (err: Error | null, userAgent: UserAgent | null) => void): void {
  const agentName = req.headers['user-agent'] || 'SpraxAPI',
    isInternalAgent = !req.headers['user-agent'];

  const cacheKey = `${agentName};${isInternalAgent}`;
  const cacheValue: UserAgent | Error | null | undefined = userAgentCache.get(cacheKey);

  if (cacheValue == undefined) {
    db.getUserAgent(agentName, isInternalAgent, (err, userAgent) => {
      if (err || !userAgent) return callback(err, null);

      userAgentCache.set(cacheKey, userAgent);
      return callback(null, userAgent);
    });
  } else {
    if (!cacheValue) return callback(null, null); // Not Found
    if (cacheValue instanceof Error) return callback(cacheValue, null); // Error

    return callback(null, cacheValue); // Hit cache
  }
}