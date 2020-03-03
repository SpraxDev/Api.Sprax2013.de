import request = require('request');
import fs = require('fs');
import path = require('path');
import nCache = require('node-cache');
import { Router, Request } from 'express';
import { restful, isUUID, toBoolean, Image, ErrorBuilder, ApiError, HttpError, setCaching, isNumber, toInt, isHttpURL, getFileNameFromURL } from '../utils';
import { MinecraftProfile, MinecraftUser, MinecraftNameHistoryElement, UserAgent, CapeType, SkinArea } from '../global';
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

                img.toCleanSkinBuffer((err, cleanSkin) => {
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

const SKIN_STEVE = fs.readFileSync(path.join(__dirname, '..', '..', 'resources', 'steve.png')),
  SKIN_ALEX = fs.readFileSync(path.join(__dirname, '..', '..', 'resources', 'steve.png'));

const router = Router();
export const minecraftExpressRouter = router;

const whitelistedSkinURLs = ['//textures.minecraft.net/texture/'];

// Turn :user into uuid (without hyphenes)
router.param('user', (req, _res, next, value, name) => {
  if (typeof value != 'string') return next(new ErrorBuilder().invalidParams('url', [{ param: 'user', condition: 'Is string' }]));

  if (value.length <= 16) {
    if (req.route.path.startsWith('/skin/:user') && value.toLowerCase() != 'x-url' && req.query.url) return next(new ErrorBuilder().invalidParams('query', [{ param: 'url', condition: `User to equal (ignore case) "X-URL" or no url parameter` }]));

    if (req.route.path.startsWith('/skin/:user') && value.toLowerCase() == 'x-url') { // Skin-Request (uses url-query instead)
      if (!req.query.url) return next(new ErrorBuilder().invalidParams('query', [{ param: 'url', condition: 'url.length > 0' }]));
      if (!isHttpURL(req.query.url)) return next(new ErrorBuilder().invalidParams('query', [{ param: 'url', condition: 'url starts with http:// or https://' }]));

      let qURL: string = req.query.url.toLowerCase();

      if (qURL.startsWith('https')) {
        qURL = qURL.substring(6);
      } else {
        qURL = qURL.substring(5);
      }

      let isWhitelisted: boolean = false;
      for (const elem of whitelistedSkinURLs) {
        if (qURL.startsWith(elem)) {
          isWhitelisted = true;
          break;
        }
      }

      if (!isWhitelisted) return next(new ErrorBuilder().invalidParams('query', [{ param: 'url', condition: `url is whitelisted (Whitelisted: ${whitelistedSkinURLs.join('", "')})` }]));

      req.params[name] = value.toLowerCase();
      next();
    } else {  // Normal request
      let at: string | null = null;
      if (req.query.at) {
        if (!isNumber(req.query.at)) return next(new ErrorBuilder().invalidParams('query', [{ param: 'at', condition: 'Is numeric string (0-9)' }]));
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
    }
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

router.param('skinArea', (req, _res, next, value, name) => {
  if (typeof value != 'string') return next(new ErrorBuilder().invalidParams('url', [{ param: 'skinArea', condition: 'Is string' }]));

  let skinArea: string | null = null;

  for (const key in SkinArea) {
    if (key == value.toUpperCase()) {
      skinArea = key;
      break;
    }
  }

  if (!skinArea) return next(new ErrorBuilder().invalidParams('url', [{ param: 'skinArea', condition: `Equal (ignore case) one of the following: ${Object.keys(SkinArea).join('", "')}` }]));

  req.params[name] = skinArea;
  next();
});

router.param('capeType', (req, _res, next, value, name) => {
  if (typeof value != 'string') return next(new ErrorBuilder().invalidParams('url', [{ param: 'capeType', condition: 'Is string' }]));

  let capeType: string | null = null;

  for (const key in CapeType) {
    if (key == value.toUpperCase()) {
      capeType = key;
      break;
    }
  }

  if (!capeType) return next(new ErrorBuilder().invalidParams('url', [{ param: 'capeType', condition: `Equal (ignore case) one of the following: ${Object.keys(CapeType).join('", "')}` }]));

  req.params[name] = capeType;
  next();
});

/* Account Routes */
router.all('/uuid/:name?', (req, res, next) => {
  restful(req, res, {
    get: () => {
      if (!req.params.name) return next(new ErrorBuilder().invalidParams('url', [{ param: 'name', condition: 'name.length > 0' }]));

      let at;
      if (req.query.at) {
        if (!isNumber(req.query.at)) return next(new ErrorBuilder().invalidParams('query', [{ param: 'at', condition: 'Is numeric string (0-9)' }]));
        at = req.query.at;
      }

      getByUsername(req.params.name, at, (err, apiRes) => {
        if (err) return next(err);
        if (!apiRes) return next(new ErrorBuilder().notFound('Profile for given user', true));

        setCaching(res, true, true, 60).send(apiRes);
      });
    }
  });
});

router.all('/profile/:user?', (req, res, next) => {
  restful(req, res, {
    get: () => {
      if (!req.params.user) return next(new ErrorBuilder().invalidParams('url', [{ param: 'user', condition: 'user.length > 0' }]));
      const raw = typeof req.query.raw == 'string' ? toBoolean(req.query.raw) : true;

      getByUUID(req.params.user, req, (err, mcUser) => {
        if (err) return next(err);
        if (!mcUser) return next(new ErrorBuilder().notFound('Profile for given user', true));

        return setCaching(res, true, true, 60).send(raw ? mcUser.toOriginal() : mcUser.toCleanJSON());
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

        setCaching(res, true, true, 60).send(mcUser.nameHistory);
      });
    }
  });
});

/* Skin Routes */
router.all('/skin/:user?', (req, res, next) => {
  const sendDownloadHeaders = (mimeType: string, download: boolean, fileIdentifier: string): void => {
    res.type(mimeType);
    if (download) {
      res.set('Content-Disposition', `attachment;filename=${fileIdentifier}.png`);
    }
  };

  restful(req, res, {
    get: () => {
      if (!req.params.user) return next(new ErrorBuilder().invalidParams('url', [{ param: 'user', condition: 'user.length > 0' }]));

      const raw = typeof req.query.raw == 'string' ? toBoolean(req.query.raw) : false;
      const download = typeof req.query.download == 'string' ? toBoolean(req.query.download) : false;
      const mimeType = download ? 'application/octet-stream' : 'png';

      if (req.params.user != 'x-url') {
        getByUUID(req.params.user, req, (err, mcUser) => {
          if (err) return next(err);
          if (!mcUser) return next(new ErrorBuilder().notFound('Profile for given user', true));

          const skinURL = mcUser.getSecureSkinURL();

          if (skinURL) {
            request.get(skinURL, { encoding: null }, (err, httpRes, httpBody) => {
              if (err) return next(err);

              if (httpRes.statusCode == 200) {
                if (!raw) {
                  Image.fromImg(httpBody, (err, img) => {
                    if (err || !img) return next(err);

                    img.toCleanSkinBuffer((err, png) => {
                      if (err) return next(err);

                      sendDownloadHeaders(mimeType, download, mcUser.name);
                      setCaching(res, true, true, 60).send(png);
                    });
                  });
                } else {
                  sendDownloadHeaders(mimeType, download, mcUser.name);
                  setCaching(res, true, true, 60).send(httpBody);
                }
              } else {
                if (httpRes.statusCode != 404) ApiError.log(`${mcUser.skinURL} returned HTTP-Code ${httpRes.statusCode}`);

                sendDownloadHeaders(mimeType, download, mcUser.name);

                setCaching(res, true, true, 60).send(mcUser.isAlexDefaultSkin() ? SKIN_ALEX : SKIN_STEVE);
              }
            });
          } else {
            sendDownloadHeaders(mimeType, download, mcUser.name);

            setCaching(res, true, true, 60).send(mcUser.isAlexDefaultSkin() ? SKIN_ALEX : SKIN_STEVE);
          }
        });
      } else {
        const skinURL: string = req.query.url.toLowerCase().startsWith('http://') ? 'https' + req.query.url.substring(4) : req.query.url;

        request.get(skinURL, { encoding: null }, (err, httpRes, httpBody) => {
          if (err) return next(err);

          if (httpRes.statusCode == 200) {
            if (!raw) {
              Image.fromImg(httpBody, (err, img) => {
                if (err || !img) return next(err);

                img.toCleanSkinBuffer((err, png) => {
                  if (err) return next(err);

                  sendDownloadHeaders(mimeType, download, getFileNameFromURL(skinURL));
                  setCaching(res, true, true, 60 * 60).send(png);
                });
              });
            } else {
              sendDownloadHeaders(mimeType, download, getFileNameFromURL(skinURL));
              setCaching(res, true, true, 60 * 60).send(httpBody);
            }
          } else {
            setCaching(res, true, true, 15 * 60);
            next(new ErrorBuilder().notFound('Provided URL returned 404 (Not Found)'));
          }
        });
      }
    }
  });
});

router.all('/skin/:user?/:skinArea?', (req, res, next) => {
  const sendDownloadHeaders = (mimeType: string, download: boolean, fileIdentifier: string): void => {
    res.type(mimeType);
    if (download) {
      res.set('Content-Disposition', `attachment;filename=${fileIdentifier}.png`);
    }
  };

  const renderSkin = function (skin: Buffer, area: SkinArea, overlay: boolean, size: number, slim: boolean | null, callback: (err: Error | null, png: Buffer | null) => void): void {
    Image.fromImg(skin, (err, skinImg) => {
      if (err || !skinImg) return callback(err, null);
      if (!skinImg.hasSkinDimensions()) return callback(new ErrorBuilder().invalidParams('query', [{ param: 'url', condition: 'Image has valid skin dimensions (32x64 or 64x64 pixels)' }]), null);

      skinImg.toCleanSkin((err) => {
        if (err) return callback(err, null);

        if (typeof slim != 'boolean') slim = skinImg.isSlimSkinModel();

        const dimensions: { x: number, y: number } =
          area == SkinArea.HEAD ? { x: 8, y: 8 } :
            area == SkinArea.BUST ? { x: slim ? 14 : 16, y: 20 } : { x: slim ? 14 : 16, y: 32 };

        Image.empty(dimensions.x, dimensions.y, (err, img) => {
          if (err || !img) return callback(err, null);


          const armWidth = slim ? 3 : 4,
            xOffset = slim ? 1 : 0;

          if (area == SkinArea.HEAD) {
            img.drawSubImg(skinImg, 8, 8, 8, 8, 0, 0);                        // Head
          } else if (area == SkinArea.BUST || area == SkinArea.BODY) {
            img.drawSubImg(skinImg, 8, 8, 8, 8, 4 - xOffset, 0);              // Head

            img.drawSubImg(skinImg, 20, 20, 8, 12, 4 - xOffset, 8);           // Body
            img.drawSubImg(skinImg, 44, 20, armWidth, 12, 0, 8);              // Right arm
            img.drawSubImg(skinImg, 36, 52, armWidth, 12, 12 - xOffset, 8);   // Left arm
          }

          if (area == SkinArea.BODY) {
            img.drawSubImg(skinImg, 4, 20, 4, 12, 4 - xOffset, 20);           // Right leg
            img.drawSubImg(skinImg, 20, 52, 4, 12, 8 - xOffset, 20);          // Left leg
          }

          if (overlay) {
            if (area == SkinArea.HEAD) {
              img.drawSubImg(skinImg, 40, 8, 8, 8, 0, 0);                     // Head (overlay)
            } else if (area == SkinArea.BUST || area == SkinArea.BODY) {
              img.drawSubImg(skinImg, 40, 8, 8, 8, 4 - xOffset, 0);           // Head (overlay)

              img.drawSubImg(skinImg, 20, 36, 8, 12, 4 - xOffset, 8);         // Body (overlay)
              img.drawSubImg(skinImg, 44, 36, armWidth, 12, 0, 8);            // Right arm (overlay)
              img.drawSubImg(skinImg, 52, 52, armWidth, 12, 12 - xOffset, 8); // Left arm (overlay)
            }

            if (area == SkinArea.BODY) {
              img.drawSubImg(skinImg, 4, 36, 4, 12, 4 - xOffset, 20);         // Right leg (overlay)
              img.drawSubImg(skinImg, 4, 52, 4, 12, 8 - xOffset, 20);         // Left leg (overlay)
            }
          }

          img.toPngBuffer((err, png) => callback(err, png), size, size);
        });
      });
    });
  };

  restful(req, res, {
    get: () => {
      if (!req.params.user) return next(new ErrorBuilder().invalidParams('url', [{ param: 'user', condition: 'user.length > 0' }]));
      if (!req.params.skinArea) return next(new ErrorBuilder().invalidParams('url', [{ param: 'skinArea', condition: `Equal (ignore case) one of the following: ${Object.keys(SkinArea).join('", "')}` }]));

      const overlay: boolean = typeof req.query.overlay == 'string' ? toBoolean(req.query.overlay) : true;
      // const render3D: boolean = typeof req.query['3d'] == 'string' ? toBoolean(req.query['3d']) : true;
      const size: number | null = typeof req.query.size == 'string' ? toInt(req.query.size) : 512;
      const slimModel: boolean | null = typeof req.query.slim == 'string' ? toBoolean(req.query.slim) : null;

      if (!size || size < 8 || size > 1024) return next(new ErrorBuilder().invalidParams('query', [{ param: 'size', condition: 'size >= 8 and size <= 1024' }]));

      const skinArea = req.params.skinArea as SkinArea;
      const download: boolean = typeof req.query.download == 'string' ? toBoolean(req.query.download) : false;
      const mimeType: string = download ? 'application/octet-stream' : 'png';

      if (req.params.user != 'x-url') {
        getByUUID(req.params.user, req, (err, mcUser) => {
          if (err) return next(err);
          if (!mcUser) return next(new ErrorBuilder().notFound('Profile for given user', true));

          const skinURL = mcUser.getSecureSkinURL();

          if (skinURL) {
            request.get(skinURL, { encoding: null }, (err, httpRes, httpBody) => {
              if (err) return next(err);

              if (httpRes.statusCode != 200 && httpRes.statusCode != 404) ApiError.log(`${mcUser.skinURL} returned HTTP-Code ${httpRes.statusCode}`);

              const skinBuffer: Buffer = httpRes.statusCode == 200 ? httpBody : (mcUser.isAlexDefaultSkin() ? SKIN_ALEX : SKIN_STEVE);
              renderSkin(skinBuffer, skinArea, overlay, size, typeof slimModel == 'boolean' ? slimModel : mcUser.modelSlim, (err, png) => {
                if (err || !png) return next(err);

                sendDownloadHeaders(mimeType, download, `${mcUser.name}-${skinArea.toLowerCase()}`);
                setCaching(res, true, true, 60).send(png);
              });
            });
          } else {
            renderSkin(mcUser.isAlexDefaultSkin() ? SKIN_ALEX : SKIN_STEVE, skinArea, overlay, size, slimModel, (err, png) => {
              if (err || !png) return next(err);

              sendDownloadHeaders(mimeType, download, `${mcUser.name}-${skinArea.toLowerCase()}`);
              setCaching(res, true, true, 60).send(png);
            });
          }
        });
      } else {
        const skinURL: string = req.query.url.toLowerCase().startsWith('http://') ? 'https' + req.query.url.substring(4) : req.query.url;

        request.get(skinURL, { encoding: null }, (err, httpRes, httpBody) => {
          if (err) return next(err);

          if (httpRes.statusCode == 200) {
            renderSkin(httpBody, skinArea, overlay, size, slimModel, (err, png) => {
              if (err || !png) return next(err);

              sendDownloadHeaders(mimeType, download, `${getFileNameFromURL(skinURL)}-${skinArea.toLowerCase()}`);
              setCaching(res, true, true, 60 * 60).send(png);
            });
          } else {
            setCaching(res, true, true, 15 * 60);
            next(new ErrorBuilder().notFound('Provided URL returned 404 (Not Found)'));
          }
        });
      }
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

              setCaching(res, true, true, 60).send(httpBody);
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

        setCaching(res, true, true, 120).send(hashes);
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