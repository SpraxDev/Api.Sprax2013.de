import request = require('request');
import fs = require('fs');
import nCache = require('node-cache');
import { Router, Request } from 'express';
import { restful, isUUID, toBoolean, Image } from '../utils';
import { MinecraftProfile, MinecraftUser, MinecraftNameHistoryElement, UserAgent, CapeType } from '../global';
import { db } from '../index';

const uuidCache = new nCache({ stdTTL: 62, useClones: false }), /* key:name_lower, value: { id: string, name: string } | Error | null */
  userCache = new nCache({ stdTTL: 62, useClones: false }), /* key: id, value: MinecraftUser | Error | null */
  userAgentCache = new nCache({ stdTTL: 10 * 60, useClones: false });

userCache.on('set', async (_key: string, value: MinecraftUser | Error | null) => {
  if (value instanceof MinecraftUser) {
    db.updateUser(value, (err) => {
      if (err) return console.error(err);  //TODO: log to file

      /* Skin */
      const skinURL = value.getSecureSkinURL();
      if (skinURL) {
        request.get(skinURL, { encoding: null }, (err, httpRes, httpBody) => {
          if (err) return console.log(err);  // TODO log to file

          if (httpRes.statusCode == 200) {
            Image.fromImg(httpBody, (err, img) => {
              if (err || !img) return console.log(new Error('500'));  // TODO log to file

              img.toPngBuffer((err, orgSkin) => {
                if (err || !orgSkin) return console.log(new Error('500'));  // TODO log to file

                img.toCleanSkin((err, cleanSkin) => {
                  if (err || !cleanSkin) return console.log(new Error('500'));  // TODO log to file

                  db.addSkin(orgSkin, cleanSkin, skinURL, value.textureValue, value.textureSignature, value.userAgent, (err, skin) => {
                    if (err || !skin) return console.log(new Error('500'));  // TODO log to file

                    db.addSkinToUserHistory(value, skin, (err) => {
                      if (err) return console.log(new Error('500'));  // TODO log to file
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
            if (err) return console.log(err);  // TODO log to file

            if (httpRes.statusCode == 200) {
              Image.fromImg(httpBody, (err, img) => {
                if (err || !img) return console.log(new Error('500'));  // TODO log to file

                img.toPngBuffer((err, capePng) => {
                  if (err || !capePng) return console.log(new Error('500'));  // TODO log to file

                  db.addCape(capePng, capeType, capeURL, value.textureValue, value.textureSignature, value.userAgent, (err, cape) => {
                    if (err || !cape) return console.log(new Error('500'));  // TODO log to file

                    db.addCapeToUserHistory(value, cape, (err) => {
                      if (err) return console.log(new Error('500'));  // TODO log to file
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

// enum SkinType {
//   HEAD, FRONT, BODY
// }

const router = Router();
export const minecraftExpressRouter = router;

// Turn :user into uuid (without hyphenes)
router.param('user', (req, res, next, value, name) => {
  if (typeof value != 'string') return next(new Error('400 - Invalid user param'));

  if (value.length <= 16) {
    let at: string | null = null;
    if (req.query.at) {
      if (!(/^\d+$/.test(req.query.at))) return next(new Error('Invalid query-parameter: at'));
      at = req.query.at;
    }

    getByUsername(value, at, (err, apiRes) => {
      if (err) return next(err);
      if (!apiRes) return res.sendStatus(404);

      getByUUID(apiRes.id, req, (err, mcUser) => {
        if (err) return next(err);
        if (!mcUser) return res.sendStatus(404);

        req.params[name] = mcUser.id;
        return next();
      });
    });
  } else if (isUUID(value)) {
    getByUUID(value, req, (err, mcUser) => {
      if (err) return next(err);
      if (!mcUser) return res.sendStatus(404);

      req.params[name] = mcUser.id;
      return next();
    });
  } else {
    return next(new Error('400 - Invalid user param'));
  }
});

router.param('capeType', (req, res, next, value, name) => {
  if (typeof value != 'string') return next(new Error('400 - Invalid user param'));

  let capeType: string | null = null;

  for (const key in CapeType) {
    if (key == value.toUpperCase()) {
      capeType = key;
      break;
    }
  }

  if (!capeType) return res.sendStatus(404);

  req.params[name] = capeType;
  next();
});

/* Account Routes */
router.all('/profile/:user?', (req, res, next) => {
  restful(req, res, {
    get: () => {
      if (!req.params.user) return next(new Error('Invalid parameter for user'));
      const raw = typeof req.query.raw == 'string' ? toBoolean(req.query.raw) : true;

      getByUUID(req.params.user, req, (err, mcUser) => {
        if (err) return next(new Error('500'));
        if (!mcUser) return res.sendStatus(404);

        return res.send(raw ? mcUser.toOriginal() : mcUser.toCleanJSON());
      });
    }
  });
});

router.all('/uuid/:name?', (req, res, next) => {
  restful(req, res, {
    get: () => {
      if (!req.params.name) return next(new Error('Invalid parameter for name'));

      let at;
      if (req.query.at) {
        if (!(/^\d+$/.test(req.query.at))) return next(new Error('Invalid query-parameter for at'));
        at = req.query.at;
      }

      getByUsername(req.params.name, at, (err, apiRes) => {
        if (err) return next(new Error('500'));
        if (!apiRes) return res.sendStatus(404);

        res.send(apiRes);
      });
    }
  });
});

router.all('/history/:user?', (req, res, next) => {
  restful(req, res, {
    get: () => {
      if (!req.params.user) return next(new Error('Invalid parameter for user'));

      getByUUID(req.params.user, req, (err, mcUser) => {
        if (err) return next(new Error('500'));
        if (!mcUser || !mcUser.nameHistory) return res.sendStatus(404);

        res.send(mcUser.nameHistory);
      });
    }
  });
});

/* Skin Routes */
router.all('/skin/:user?', (req, res, next) => {
  restful(req, res, {
    get: () => {
      if (!req.params.user) return next(new Error('Invalid parameter for user'));

      const raw = typeof req.query.raw == 'string' ? toBoolean(req.query.raw) : false;
      const download = typeof req.query.download == 'string' ? toBoolean(req.query.download) : false;
      const mimeType = download ? 'application/octet-stream' : 'png';

      getByUUID(req.params.user, req, (err, mcUser) => {
        if (err) return next(new Error('500'));
        if (!mcUser) return res.sendStatus(404);

        const skinURL = mcUser.getSecureSkinURL();

        if (skinURL) {
          request.get(skinURL, { encoding: null }, (err, httpRes, httpBody) => {
            if (err) return next(new Error('500'));

            if (httpRes.statusCode == 200) {
              if (raw) {
                res.type(mimeType);
                if (download) {
                  res.set('Content-Disposition', `attachment;filename=${mcUser.name}.png`);
                }

                res.send(httpBody);
              } else {
                Image.fromImg(httpBody, (err, img) => {
                  if (err || !img) return next(new Error('500'));

                  img.toCleanSkin((err, png) => {
                    if (err) return next(new Error('500'));

                    res.type(mimeType);
                    if (download) {
                      res.set('Content-Disposition', `attachment;filename=${mcUser.name}.png`);
                    }

                    res.send(png);
                  });
                });
              }
            } else {
              if (httpRes.statusCode != 404) console.error(mcUser.skinURL, 'returned HTTP-Code', httpRes.statusCode); //TODO Log to file

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
      if (!req.params.user) return next(new Error('Invalid parameter for user'));

      const download = typeof req.query.download == 'string' ? toBoolean(req.query.download) : false;
      const mimeType = download ? 'application/octet-stream' : 'png';

      getByUUID(req.params.user, req, (err, mcUser) => {
        if (err) return next(new Error('500'));
        if (!mcUser) return res.sendStatus(404);

        const capeType = req.params.capeType as CapeType;
        const capeURL = capeType == CapeType.MOJANG ? mcUser.getSecureCapeURL() :
          capeType == CapeType.OPTIFINE ? mcUser.getOptiFineCapeURL() :
            capeType == CapeType.LABY_MOD ? mcUser.getLabyModCapeURL() : null;

        if (capeURL) {
          request.get(capeURL, { encoding: null }, (err, httpRes, httpBody) => {
            if (err) return next(new Error('500'));

            if (httpRes.statusCode == 200) {
              res.type(mimeType);
              if (download) {
                res.set('Content-Disposition', `attachment;filename=${mcUser.name}.png`);
              }

              res.send(httpBody);
            } else {
              if (httpRes.statusCode != 404) console.error(mcUser.skinURL, 'returned HTTP-Code', httpRes.statusCode); //TODO Log to file

              res.sendStatus(404);
            }
          });
        } else {
          res.sendStatus(404);
        }
      });
    }
  });
});

/* Server Routes */
router.all('/servers/blocked', (req, res, next) => {  // TODO: return object (hash: known host or null) with query param to only return array
  restful(req, res, {
    get: () => {
      getBlockedServers((err, hashes) => {
        if (err) return next(new Error('500'));
        if (!hashes) return res.sendStatus(404);

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
        console.error(`Mojang returned ${httpRes.statusCode} on uuid lookup for ${username}(at=${at || 'null'})`);  //TODO: log to file

        if (at != null) return callback(err || new Error('500 - API hit an 429'), null); // Currently no fallback available accepting at-param

        // Contact fallback api (should not be necessary but is better than returning an 429 or 500)
        request.get(`https://api.ashcon.app/mojang/v1/user/${username}`, {}, (err, httpRes, httpBody) => {
          if (err || (httpRes.statusCode != 200 && httpRes.statusCode != 404)) return callback(err || new Error('500 - API hit an 429'), null);
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
          console.error(`Mojang returned ${httpRes.statusCode} on name history for ${mcUser.id}`);  //TODO: log to file

          // Contact fallback api (should not be necessary but is better than returning an 429 or 500
          request.get(`https://api.ashcon.app/mojang/v2/user/${mcUser.id}`, {}, (err, httpRes, httpBody) => {  // FIXME: This api never returns legacy-field
            if (err || (httpRes.statusCode != 200 && httpRes.statusCode != 404)) return callback(err || new Error('500 - API hit an 429'), null);
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
        console.error(`Mojang returned ${httpRes.statusCode} on profile for ${uuid}`);  //TODO: log to file

        // Contact fallback api (should not be necessary but is better than returning an 429 or 500
        request.get(`https://api.ashcon.app/mojang/v2/user/${uuid}`, {}, (err, httpRes, httpBody) => {  // FIXME: This api never returns legacy-field
          if (err || (httpRes.statusCode != 200 && httpRes.statusCode != 404)) return callback(err || new Error('500 - API hit an 429'), null);
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
            if (err || !userAgent) return callback(new Error('500'), null);

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
            if (err || !userAgent) return callback(new Error('500'), null);

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