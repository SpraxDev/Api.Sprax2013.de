// TODO: File is WAY too large
import nCache = require('node-cache');
import { readFileSync } from 'fs';
import { isIPv4 } from 'net';
import { join as joinPath } from 'path';
import { Request, Response, Router } from 'express';

import { Camera, createCamera, createModel, Model } from '../utils/modelRender';
import { db } from '../index';
import { getHttp } from '../utils/web';
import { importByTexture, importCapeByURL } from './skindb';
import { CapeType, MinecraftNameHistoryElement, MinecraftProfile, MinecraftUser, SkinArea, UserAgent } from '../global';
import {
  ApiError,
  convertFQDNtoASCII,
  ErrorBuilder,
  generateHash,
  getFileNameFromURL,
  HttpError,
  Image,
  isHttpURL,
  isNumber,
  isUUID,
  isValidFQDN,
  restful,
  setCaching,
  toBoolean,
  toInt
} from '../utils/utils';

/* key:${name_lower};${at||''}, value: { id: string, name: string } | Error | null */
const uuidCache = new nCache({stdTTL: 59, useClones: false}),
    /* key: profile.id, value: MinecraftUser | Error | null */
    userCache = new nCache({stdTTL: 59, useClones: false}),
    /* key: ${userAgent};${internal(boolean)}, value: UserAgent */
    userAgentCache = new nCache({
      stdTTL: 10 * 60,
      useClones: false
    });

const userCacheWaitingForImportQueue: { key: string, callback: (err: Error | null, user: MinecraftUser | null) => void }[] = [];

const profileRequestQueue: { key: string, callback: (err: Error | null, user: MinecraftUser | null) => void }[] = [],
    uuidRequestQueue: { key: string, callback: (err: Error | null, apiRes: { id: string, name: string } | null) => void }[] = [];

let rateLimitedNameHistory = 0;

const rendering = {
  cams: {
    body: function () {
      const cam = createCamera(525, 960);
      cam.setPosition({x: -0.75, y: 2.1, z: -1.25});
      cam.setRotation({x: Math.PI / 12, y: Math.PI / 6, z: 0});
      cam.setPostPosition({x: 0.023, y: -0.380625});
      cam.setScale({x: 1.645, y: 1.645});

      return cam;
    }(),
    bodyNoOverlay: function () {
      const cam = createCamera(510, 960);
      cam.setPosition({x: -0.75, y: 2.1, z: -1.25});
      cam.setRotation({x: Math.PI / 12, y: Math.PI / 6, z: 0});
      cam.setPostPosition({x: 0.023, y: -0.39});
      cam.setScale({x: 1.6675, y: 1.6675});

      return cam;
    }(),

    head: function () {
      const cam = createCamera(1040, 960);
      cam.setPosition({x: -0.75, y: 2.1, z: -1.25});
      cam.setRotation({x: Math.PI / 12, y: Math.PI / 6, z: 0});
      cam.setPostPosition({x: -0.0335, y: -0.025});
      cam.setScale({x: 3.975, y: 3.975});

      return cam;
    }(),
    headNoOverlay: function () {
      const cam = createCamera(1035, 960);
      cam.setPosition({x: -0.75, y: 2.1, z: -1.25});
      cam.setRotation({x: Math.PI / 12, y: Math.PI / 6, z: 0});
      cam.setPostPosition({x: -0.0295, y: -0.013});
      cam.setScale({x: 4.49, y: 4.49});

      return cam;
    }(),

    block: function () {
      const cam = createCamera(256, 256);
      cam.setPosition({x: -1.25, y: 1.25, z: -1.25});
      cam.setRotation({x: Math.PI / 4, y: Math.PI / 4, z: 0});
      cam.setPostPosition({x: 0, y: .145});
      cam.setScale({x: 2.5, y: 2.5});

      return cam;
    }()
  },

  models: {
    modelAlex: createModel(joinPath(__dirname, '..', '..', 'resources', 'rendering_models', 'alex.obj'), 64, 64),
    modelAlexNoOverlay: createModel(joinPath(__dirname, '..', '..', 'resources', 'rendering_models', 'alexNoOverlay.obj'), 64, 64),
    modelSteve: createModel(joinPath(__dirname, '..', '..', 'resources', 'rendering_models', 'steve.obj'), 64, 64),
    modelSteveNoOverlay: createModel(joinPath(__dirname, '..', '..', 'resources', 'rendering_models', 'steveNoOverlay.obj'), 64, 64),
    modelSteveHead: createModel(joinPath(__dirname, '..', '..', 'resources', 'rendering_models', 'steveHead.obj'), 64, 64),
    modelSteveHeadNoOverlay: createModel(joinPath(__dirname, '..', '..', 'resources', 'rendering_models', 'steveHeadNoOverlay.obj'), 64, 64),

    block: createModel(joinPath(__dirname, '..', '..', 'resources', 'rendering_models', 'block.obj'), 64, 64)
  }
};

userCache.on('set', async (key: string, value: MinecraftUser | Error | null) => {
  const done = () => {
    let i: number;
    do {
      i = userCacheWaitingForImportQueue.findIndex((val) => val.key == key);

      if (i != -1) {
        const err = value instanceof Error ? value : null;
        const user = err || value == null ? null : value as MinecraftUser;

        userCacheWaitingForImportQueue[i].callback(err, user);
        userCacheWaitingForImportQueue.splice(i, 1);
      }
    } while (i != -1);
  };

  if (!db.isAvailable() || (!(value instanceof MinecraftUser) && value != null)) return done();

  if (value == null) {
    // We don't care about the result as the profile does not exist anymore (or never did)
    db.markUserDeleted(key)
        .catch((err) => {
          // Just log errors that occured
          ApiError.log('Could not mark user as deleted in database', {key: key, stack: err.stack});
        });

    done();
  } else {
    db.updateUser(value)
        .then(async (): Promise<void> => {
          /* Skin */
          if (value.textureValue) {
            try {
              const importedTextures = await importByTexture(value.textureValue, value.textureSignature, value.userAgent);

              if (importedTextures.cape) {
                try {
                  await db.addCapeToUserHistory(value, importedTextures.cape, new Date(MinecraftUser.extractMinecraftProfileTextureProperty(value.textureValue).timestamp));
                } catch (err) {
                  ApiError.log(`Could not update cape-history in database`, {
                    cape: importedTextures.cape.id,
                    profile: value.id,
                    stack: err.stack
                  });
                }
              }
            } catch (err) {
              ApiError.log('Could not import skin/cape from profile', {
                skinURL: value.skinURL,
                profile: value.id,
                stack: (err || new Error()).stack
              });
            }
          }

          /* Capes */
          const processCape = (capeURL: string | null, capeType: CapeType): Promise<void> => {
            return new Promise((resolve, reject) => {
              if (!capeURL) return resolve();

              importCapeByURL(capeURL, capeType, value.userAgent, value.textureValue || undefined, value.textureSignature || undefined)
                  .then((cape) => {
                    if (!cape) return resolve();

                    if (capeType != 'MOJANG') {
                      db.addCapeToUserHistory(value, cape, value.textureValue ? new Date(MinecraftUser.extractMinecraftProfileTextureProperty(value.textureValue).timestamp) : 'now')
                          .then(resolve)
                          .catch((err) => {
                            ApiError.log(`Could not update cape-history in database`, {
                              cape: cape.id,
                              profile: value.id,
                              stack: err.stack
                            });
                            reject(err);
                          });
                    }
                  })
                  .catch((err) => {
                    ApiError.log(`Could not import cape(type=${capeType}) from profile`, {
                      capeURL: capeURL,
                      profile: value.id,
                      stack: err.stack
                    });
                    reject(err);
                  });
            });
          };

          try {
            await processCape(value.getOptiFineCapeURL(), CapeType.OPTIFINE);
          } catch (err) {
            ApiError.log('Could not process OptiFine-Cape', err);
          }

          try {
            await processCape(value.getLabyModCapeURL(), CapeType.LABYMOD);
          } catch (err) {
            ApiError.log('Could not process LabyMod-Cape', err);
          }

          done();
        })
        .catch((err) => {
          ApiError.log('Could not update user in database', {profile: value.id, stack: err.stack});
        });
  }
});

setInterval(() => {
  rateLimitedNameHistory = 0;
}, 120 * 1000);

const SKIN_STEVE = readFileSync(joinPath(__dirname, '..', '..', 'resources', 'steve.png')),
    SKIN_ALEX = readFileSync(joinPath(__dirname, '..', '..', 'resources', 'alex.png'));

const whitelistedSkinURLs = ['//textures.minecraft.net/texture/', '//cdn.skindb.net/'];

const router = Router();
export const minecraftExpressRouter = router;

// Turn :user into uuid (without hyphenes) or if :user == x-url check if query-param url is valid
router.param('user', (req, _res, next, value, name) => {
  if (typeof value != 'string') {
    return next(new ErrorBuilder().invalidParams('url', [{
      param: 'user',
      condition: 'Is string'
    }]));
  }

  value = value.trim();

  if (value.length <= 16) {
    const queryURL = req.query.url;

    if (req.route.path.startsWith('/skin/:user') && value.toLowerCase() != 'x-url' && queryURL) {
      return next(new ErrorBuilder().invalidParams('query', [{
        param: 'url',
        condition: `User to equal (ignore case) "X-URL" or no url parameter`
      }]));
    }

    if (req.route.path.startsWith('/skin/:user') && value.toLowerCase() == 'x-url') { // Skin-Request (uses url-query instead)
      if (!queryURL || typeof queryURL != 'string') {
        return next(new ErrorBuilder().invalidParams('query', [{
          param: 'url',
          condition: 'url.length > 0'
        }]));
      }

      if (!isHttpURL(queryURL)) {
        return next(new ErrorBuilder().invalidParams('query', [{
          param: 'url',
          condition: 'url starts with http:// or https://'
        }]));
      }

      let qURL: string = queryURL.toLowerCase();

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

      if (!isWhitelisted) {
        return next(new ErrorBuilder().invalidParams('query', [{
          param: 'url',
          condition: `url is whitelisted (Whitelisted: ${whitelistedSkinURLs.join('", "')})`
        }]));
      }

      req.params[name] = value.toLowerCase();
      next();
    } else {  // Normal request
      const queryAt = req.query.at;
      let at: string | null = null;
      if (req.query.at) {
        if (typeof queryAt != 'string' || !isNumber(queryAt)) {
          return next(new ErrorBuilder().invalidParams('query', [{
            param: 'at',
            condition: 'Is numeric string (0-9)'
          }]));
        }

        at = queryAt;
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
      if (!mcUser) return next(new ErrorBuilder().notFound('Profile for given uuid'));

      req.params[name] = mcUser.id;
      return next();
    });
  } else {
    return next(new ErrorBuilder().invalidParams('url', [{
      param: 'user',
      condition: 'Is valid uuid string or user.length <= 16'
    }]));
  }
});

router.param('skinArea', (req, _res, next, value, name) => {
  if (typeof value != 'string') {
    return next(new ErrorBuilder().invalidParams('url', [{
      param: 'skinArea',
      condition: 'Is string'
    }]));
  }

  let skinArea: string | null = null;

  for (const key in SkinArea) {
    if (key == value.toUpperCase()) {
      skinArea = key;
      break;
    }
  }

  if (!skinArea) {
    return next(new ErrorBuilder().invalidParams('url', [{
      param: 'skinArea',
      condition: `Equal (ignore case) one of the following: ${Object.keys(SkinArea).join('", "')}`
    }]));
  }

  req.params[name] = skinArea;
  next();
});

router.param('capeType', (req, _res, next, value, name) => {
  if (typeof value != 'string') {
    return next(new ErrorBuilder().invalidParams('url', [{
      param: 'capeType',
      condition: 'Is string'
    }]));
  }

  let capeType: string | null = null;

  for (const key in CapeType) {
    if (key == value.toUpperCase()) {
      capeType = key;
      break;
    }
  }

  if (!capeType) {
    return next(new ErrorBuilder().invalidParams('url', [{
      param: 'capeType',
      condition: `Equal (ignore case) one of the following: ${Object.keys(CapeType).join('", "')}`
    }]));
  }

  req.params[name] = capeType;
  next();
});

/* Account Routes */
router.all('/uuid/:name?', (req, res, next) => {
  restful(req, res, {
    get: () => {
      if (!req.params.name) {
        return next(new ErrorBuilder().invalidParams('url', [{
          param: 'name',
          condition: 'name.length > 0'
        }]));
      }

      const queryAt = req.query.at;
      let at;
      if (queryAt) {
        if (typeof queryAt != 'string' || !isNumber(queryAt)) {
          return next(new ErrorBuilder().invalidParams('query', [{
            param: 'at',
            condition: 'Is numeric string (0-9)'
          }]));
        }

        at = queryAt;
      }

      getByUsername(req.params.name, at, (err, apiRes) => {
        if (err) return next(err);
        if (!apiRes) return next(new ErrorBuilder().notFound('Profile for given user'));

        setCaching(res, true, true, 60).send(apiRes);
      });
    }
  });
});

router.all('/profile/:user?', (req, res, next) => {
  restful(req, res, {
    get: () => {
      if (!req.params.user) {
        return next(new ErrorBuilder().invalidParams('url', [{
          param: 'user',
          condition: 'user.length > 0'
        }]));
      }

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
      if (!req.params.user) {
        return next(new ErrorBuilder().invalidParams('url', [{
          param: 'user',
          condition: 'user.length > 0'
        }]));
      }

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
  restful(req, res, {
    get: () => {
      if (!req.params.user) {
        return next(new ErrorBuilder().invalidParams('url', [{
          param: 'user',
          condition: 'user.length > 0'
        }]));
      }

      const raw = typeof req.query.raw == 'string' ? toBoolean(req.query.raw) : false;
      const download = typeof req.query.download == 'string' ? toBoolean(req.query.download) : false;
      const mimeType = download ? 'application/octet-stream' : 'png';

      if (req.params.user != 'x-url') {
        getByUUID(req.params.user, req, (err, mcUser) => {
          if (err) return next(err);
          if (!mcUser) return next(new ErrorBuilder().notFound('Profile for given user', true));

          const skinURL = mcUser.getSecureSkinURL();

          if (skinURL) {
            getHttp(skinURL)
                .then((httpRes) => {
                  if (httpRes.res.statusCode == 200) {
                    if (!raw) {
                      Image.fromImg(httpRes.body, (err, img) => {
                        if (err || !img) return next(err);

                        img.toCleanSkinBuffer()
                            .then((png) => {
                              sendDownloadHeaders(res, mimeType, download, mcUser.name);
                              setCaching(res, true, true, 60).send(png);
                            })
                            .catch(next);
                      });
                    } else {
                      sendDownloadHeaders(res, mimeType, download, mcUser.name);
                      setCaching(res, true, true, 60).send(httpRes.body);
                    }
                  } else {
                    if (httpRes.res.statusCode != 404) ApiError.log(`${skinURL} returned HTTP-Code ${httpRes.res.statusCode}`);

                    sendDownloadHeaders(res, mimeType, download, mcUser.name);

                    setCaching(res, true, true, 60).send(mcUser.isAlexDefaultSkin() ? SKIN_ALEX : SKIN_STEVE);
                  }
                })
                .catch(next);
          } else {
            sendDownloadHeaders(res, mimeType, download, mcUser.name);

            setCaching(res, true, true, 60).send(mcUser.isAlexDefaultSkin() ? SKIN_ALEX : SKIN_STEVE);
          }
        });
      } else {
        const skinURL: string = MinecraftUser.getSecureURL(req.query.url as string);

        getHttp(skinURL)
            .then((httpRes) => {
              if (httpRes.res.statusCode == 200) {
                if (!raw) {
                  Image.fromImg(httpRes.body, (err, img) => {
                    if (err || !img) return next(err);

                    img.toCleanSkinBuffer()
                        .then((png) => {
                          sendDownloadHeaders(res, mimeType, download, getFileNameFromURL(skinURL));
                          setCaching(res, true, true, 60 * 60).send(png);
                        })
                        .catch(next);
                  });
                } else {
                  sendDownloadHeaders(res, mimeType, download, getFileNameFromURL(skinURL));
                  setCaching(res, true, true, 60 * 60).send(httpRes.body);
                }
              } else {
                setCaching(res, true, true, 15 * 60);
                next(new ErrorBuilder().notFound('Provided URL returned 404 (Not Found)'));
              }
            })
            .catch(next);
      }
    }
  });
});

router.all('/skin/:user?/:skinArea?/:3d?', (req, res, next) => {
  restful(req, res, {
    get: () => {
      const is3D = typeof req.params['3d'] == 'string' && req.params['3d'].toLowerCase() == '3d';

      if (req.params['3d'] == 'string' && !is3D && req.params['3d'].length > 0) {
        return next(new ErrorBuilder().invalidParams('url', [{
          param: '3d',
          condition: '3d or empty'
        }]));
      }

      if (!req.params.user) {
        return next(new ErrorBuilder().invalidParams('url', [{
          param: 'user',
          condition: 'user.length > 0'
        }]));
      }
      if (!req.params.skinArea) {
        return next(new ErrorBuilder().invalidParams('url', [{
          param: 'skinArea',
          condition: `Equal (ignore case) one of the following: ${Object.keys(SkinArea).join('", "')}`
        }]));
      }

      const overlay: boolean = typeof req.query.overlay == 'string' ? toBoolean(req.query.overlay) : true;
      // const render3D: boolean = typeof req.query['3d'] == 'string' ? toBoolean(req.query['3d']) : true;
      const size: number | null = typeof req.query.size == 'string' ? toInt(req.query.size) : 512;
      const slimModel: boolean | null = typeof req.query.slim == 'string' ? toBoolean(req.query.slim) : null;

      if (!size || size < 8 || size > 1024) {
        return next(new ErrorBuilder().invalidParams('query', [{
          param: 'size',
          condition: 'size >= 8 and size <= 1024'
        }]));
      }

      const skinArea = req.params.skinArea as SkinArea;
      const download: boolean = typeof req.query.download == 'string' ? toBoolean(req.query.download) : false;
      const mimeType: string = download ? 'application/octet-stream' : 'png';

      if (req.params.user != 'x-url') {
        getByUUID(req.params.user, req, (err, mcUser) => {
          if (err) return next(err);
          if (!mcUser) return next(new ErrorBuilder().notFound('Profile for given user', true));

          const skinURL = mcUser.getSecureSkinURL();

          if (skinURL) {
            getHttp(skinURL)
                .then((httpRes) => {
                  if (httpRes.res.statusCode != 200 && httpRes.res.statusCode != 404) ApiError.log(`${skinURL} returned HTTP-Code ${httpRes.res.statusCode}`);

                  const skinBuffer: Buffer = httpRes.res.statusCode == 200 ? httpRes.body : (mcUser.isAlexDefaultSkin() ? SKIN_ALEX : SKIN_STEVE);

                  Image.fromImg(skinBuffer, (err, img) => {
                    if (err || !img) return next(err || new Error());

                    renderSkin(img, skinArea, overlay, typeof slimModel == 'boolean' ? slimModel : mcUser.modelSlim, is3D, size, (err, png) => {
                      if (err || !png) return next(err || new Error());

                      sendDownloadHeaders(res, mimeType, download, `${mcUser.name}-${skinArea.toLowerCase()}`);
                      setCaching(res, true, true, 60).send(png);
                    });
                  });
                })
                .catch(next);
          } else {
            Image.fromImg(mcUser.isAlexDefaultSkin() ? SKIN_ALEX : SKIN_STEVE, (err, img) => {
              if (err || !img) return next(err || new Error());

              renderSkin(img, skinArea, overlay, typeof slimModel == 'boolean' ? slimModel : 'auto', is3D, size, (err, png) => {
                if (err || !png) return next(err || new Error());

                sendDownloadHeaders(res, mimeType, download, `${mcUser.name}-${skinArea.toLowerCase()}`);
                setCaching(res, true, true, 60).send(png);
              });
            });
          }
        });
      } else {
        const skinURL: string = MinecraftUser.getSecureURL(req.query.url as string);

        // TODO: Fetch from db instead of url
        // if (skinURL.toLowerCase().startsWith('https://cdn.skindb.net/skins/')) {
        // }

        getHttp(skinURL)
            .then((httpRes) => {
              if (httpRes.res.statusCode == 200) {
                Image.fromImg(httpRes.body, (err, img) => {
                  if (err || !img) return next(err || new Error());

                  renderSkin(img, skinArea, overlay, typeof slimModel == 'boolean' ? slimModel : 'auto', is3D, size, (err, png) => {
                    if (err || !png) return next(err || new Error());

                    sendDownloadHeaders(res, mimeType, download, `${getFileNameFromURL(skinURL)}-${skinArea.toLowerCase()}`);
                    setCaching(res, true, true, 60 * 60 * 24 * 30 /*30d*/).send(png);
                  });
                });
              } else {
                setCaching(res, true, true, 15 * 60);
                next(new ErrorBuilder().notFound('Provided URL returned 404 (Not Found)'));
              }
            })
            .catch(next);
      }
    }
  });
});

/* Block Routes */
router.all('/render/block', (req, res, next) => {
  restful(req, res, {
    get: () => {
      const size: number | null = typeof req.query.size == 'string' ? toInt(req.query.size) : 150;

      if ((req.headers['content-type'] || '').toLowerCase() != 'image/png') {
        return next(new ErrorBuilder().invalidBody([{
          param: 'Content-Type',
          condition: 'image/png'
        }]));
      }
      if (!(req.body instanceof Buffer)) {
        return next(new ErrorBuilder().invalidBody([{
          param: 'body',
          condition: 'Valid png under 3MB'
        }]));
      }
      if (!size || size < 8 || size > 1024) {
        return next(new ErrorBuilder().invalidParams('query', [{
          param: 'size',
          condition: 'size >= 8 and size <= 1024'
        }]));
      }

      const download: boolean = typeof req.query.download == 'string' ? toBoolean(req.query.download) : false;
      const mimeType: string = download ? 'application/octet-stream' : 'png';

      Image.fromImg(req.body, (err, img) => {
        if (err || !img) return next(new ErrorBuilder().invalidBody([{param: 'body', condition: 'Valid png'}]));
        if (img.img.info.width != img.img.info.height) {
          return next(new ErrorBuilder().invalidBody([{
            param: 'body',
            condition: 'Image width equals Image height'
          }]));
        }

        img.resize(64, 64, (err, img) => {
          if (err || !img) {
            return next(new ErrorBuilder().invalidBody([{
              param: 'body',
              condition: 'Please provide an texture with dimensions of 64x64 pixels'
            }]));
          }

          renderBlock(img, size, (err, png) => {
            if (err || !png) return next(err || new Error());

            sendDownloadHeaders(res, mimeType, download, `block-${(req.body as Buffer).length}`);
            setCaching(res, false, false).send(png);
          });
        });
      });
    }
  });
});

/* Cape Routes */
router.all('/capes/:capeType/:user?', (req, res, next) => {
  restful(req, res, {
    get: () => {
      if (!req.params.user) {
        return next(new ErrorBuilder().invalidParams('url', [{
          param: 'user',
          condition: 'user.length > 0'
        }]));
      }

      const download = typeof req.query.download == 'string' ? toBoolean(req.query.download) : false;
      const mimeType = download ? 'application/octet-stream' : 'png';

      getByUUID(req.params.user, req, (err, mcUser) => {
        if (err) return next(err);
        if (!mcUser) return next(new ErrorBuilder().notFound('Profile for given user', true));

        const capeType = req.params.capeType as CapeType;
        const capeURL = capeType == CapeType.MOJANG ? mcUser.getSecureCapeURL() :
            capeType == CapeType.OPTIFINE ? mcUser.getOptiFineCapeURL() :
                capeType == CapeType.LABYMOD ? mcUser.getLabyModCapeURL() : null;

        if (capeURL) {
          getHttp(capeURL, false)
              .then((httpRes) => {
                if (httpRes.res.statusCode == 200) {
                  res.type(mimeType);
                  if (download) {
                    res.set('Content-Disposition', `attachment;filename=${mcUser.name}.png`);
                  }

                  setCaching(res, true, true, 60).send(httpRes.body);
                } else {
                  if (httpRes.res.statusCode != 404) ApiError.log(`${capeURL} returned HTTP-Code ${httpRes.res.statusCode}`);

                  return next(new ErrorBuilder().notFound('User does not have a cape for that type'));
                }
              })
              .catch(next);
        } else {
          return next(new ErrorBuilder().notFound('User does not have a cape for that type'));
        }
      });
    }
  });
});

router.all('/capes/:capeType/:user?/render', (req, res, next) => {
  const renderCape = function (cape: Buffer, type: CapeType, size: number, callback: (err: Error | null, png: Buffer | null) => void): void {
    Image.fromImg(cape, (err, capeImg) => {
      if (err || !capeImg) return callback(err, null);
      // if (!capeImg.hasSkinDimensions()) return callback(new ErrorBuilder().invalidParams('query', [{ param: 'url', condition: 'Image has valid skin dimensions (64x32 or 64x64 pixels)' }]), null); //TODO

      const dimensions: { x: number, y: number } =
          type == CapeType.MOJANG ? {x: 10, y: 16} :
              type == CapeType.OPTIFINE ? capeImg.img.info.width == 46 ? {x: 10, y: 16} : {x: 20, y: 32}
                  : {x: 10, y: 16}; // TODO

      Image.empty(dimensions.x, dimensions.y, (err, img) => {
        if (err || !img) return callback(err, null);

        if (type == CapeType.MOJANG) {
          img.drawSubImg(capeImg, 1, 1, 10, 16, 0, 0);  // Front
          // img.drawSubImg(capeImg, 12, 1, 10, 16, 0, 0);  // Back
        } else if (type == CapeType.OPTIFINE) {
          if (capeImg.img.info.width == 46 && capeImg.img.info.height == 22) {
            img.drawSubImg(capeImg, 1, 1, 10, 16, 0, 0);  // Front
            // img.drawSubImg(capeImg, 12, 1, 10, 16, 0, 0);  // Back
          } else if (capeImg.img.info.width == 92 && capeImg.img.info.height == 44) {
            img.drawSubImg(capeImg, 2, 2, 20, 32, 0, 0);  // Front
            // img.drawSubImg(capeImg, 24, 2, 20, 32, 0, 0);  // Back
          } else {
            return callback(new ErrorBuilder().serverErr('Could not render OptiFine-Cape', `Found unknown OptiFine-Cape dimensions(width=${capeImg.img.info.width}, height=${capeImg.img.info.height})`), null);
          }
        } else {
          return callback(new ErrorBuilder().serviceUnavailable('Rendering LabyMod-Capes is currently not supported'), null); // TODO
        }

        img.toPngBuffer(size, size).then((png) => callback(null, png))
            .catch((err) => callback(err, null));
      }, {r: 0, g: 0, b: 0, alpha: 255});
    });
  };

  restful(req, res, {
    get: () => {
      if (!req.params.user) {
        return next(new ErrorBuilder().invalidParams('url', [{
          param: 'user',
          condition: 'user.length > 0'
        }]));
      }

      // const render3D: boolean = typeof req.query['3d'] == 'string' ? toBoolean(req.query['3d']) : true;
      const size: number | null = typeof req.query.size == 'string' ? toInt(req.query.size) : 512;

      if (!size || size < 8 || size > 1024) {
        return next(new ErrorBuilder().invalidParams('query', [{
          param: 'size',
          condition: 'size >= 8 and size <= 1024'
        }]));
      }

      const capeType = req.params.capeType as CapeType;
      const download: boolean = typeof req.query.download == 'string' ? toBoolean(req.query.download) : false;
      const mimeType: string = download ? 'application/octet-stream' : 'png';

      if (req.params.user != 'x-url') {
        getByUUID(req.params.user, req, (err, mcUser) => {
          if (err) return next(err);
          if (!mcUser) return next(new ErrorBuilder().notFound('Profile for given user', true));

          const capeURL = capeType == CapeType.MOJANG ? mcUser.getSecureCapeURL() :
              capeType == CapeType.OPTIFINE ? mcUser.getOptiFineCapeURL() :
                  capeType == CapeType.LABYMOD ? mcUser.getLabyModCapeURL() : null;

          if (capeURL) {
            getHttp(capeURL, false)
                .then((httpRes) => {
                  if (httpRes.res.statusCode != 200 && httpRes.res.statusCode != 404) ApiError.log(`${capeURL} returned HTTP-Code ${httpRes.res.statusCode}`);
                  if (httpRes.res.statusCode != 200) return next(new ErrorBuilder().notFound('User does not have a cape for that type'));

                  renderCape(httpRes.body, capeType, size, (err, png) => {
                    if (err || !png) return next(err);

                    sendDownloadHeaders(res, mimeType, download, `${mcUser.name}-${capeType.toLowerCase()}`);
                    setCaching(res, true, true, 60).send(png);
                  });
                })
                .catch(next);
          } else {
            return next(new ErrorBuilder().notFound('User does not have a cape for that type'));
          }
        });
      } else {
        const capeURL: string = MinecraftUser.getSecureURL(req.query.url as string);

        getHttp(capeURL, false)
            .then((httpRes) => {
              if (httpRes.res.statusCode == 200) {
                renderCape(httpRes.body, capeType, size, (err, png) => {
                  if (err || !png) return next(err);

                  sendDownloadHeaders(res, mimeType, download, `${getFileNameFromURL(capeURL)}-${capeType.toLowerCase()}`);
                  setCaching(res, true, true, 60 * 60).send(png);
                });
              } else {
                setCaching(res, true, true, 15 * 60);
                next(new ErrorBuilder().notFound('Provided URL returned 404 (Not Found)'));
              }
            })
            .catch(next);
      }
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

        setCaching(res, true, true, 60 * 2).send(hashes);
      });
    }
  });
});

router.all('/servers/blocked/known', (req, res, next) => {
  restful(req, res, {
    get: () => {
      getBlockedServers((err, hashes) => {
        if (err) return next(err);
        if (!hashes) return next(new ErrorBuilder().notFound('List of blocked servers', true));

        const result: { [key: string]: string | null } = {};

        if (!db.isAvailable()) {
          return setCaching(res, true, true, 120)
              .send(result);
        }

        db.getHost(hashes)
            .then((known) => {
              for (const elem of known) {
                result[elem.hash] = elem.host;
              }

              return setCaching(res, true, true, 60 * 30)
                  .send(result);
            })
            .catch(next);
      });
    }
  });
});

router.all('/servers/blocked/check', (req, res, next) => {
  restful(req, res, {
    get: () => {
      let host: string = (req.query.host as string || '').trim().toLowerCase();

      if (!host) {
        return next(new ErrorBuilder().invalidParams('query', [{
          param: 'host',
          condition: 'host.length > 0'
        }]));
      }

      // Try removing port
      if (host.lastIndexOf(':') != -1) {
        host = host.substring(0, host.lastIndexOf(':'));
      }

      const hosts: { [key: string]: string } = {};

      let tempHost: string = host,
          tempHostIndex: number;
      if (isIPv4(host)) {
        hosts[host] = generateHash(host, 'sha1');

        while ((tempHostIndex = tempHost.lastIndexOf('.')) >= 0) {
          tempHost = tempHost.substring(0, tempHostIndex);

          hosts[`${tempHost}.*`] = generateHash(`${tempHost}.*`, 'sha1');
        }
      } else if (isValidFQDN(convertFQDNtoASCII(host))) {
        if (host.endsWith('.')) host = tempHost = convertFQDNtoASCII(host.substring(0, host.length - 1));

        hosts[`*.${host}`] = generateHash(`*.${host}`, 'sha1');
        hosts[host] = generateHash(host, 'sha1');

        while ((tempHostIndex = tempHost.indexOf('.')) >= 0) {
          tempHost = tempHost.substring(tempHostIndex + 1);

          hosts[`*.${tempHost}`] = generateHash(`*.${tempHost}`, 'sha1');
        }
      } else {
        return next(new ErrorBuilder().invalidParams('query', [{param: 'host', condition: 'A valid IPv4 or domain'}]));
      }

      if (db.isAvailable()) {
        const dbHosts = [];
        for (const host in hosts) {
          dbHosts.push({host, hash: hosts[host]});
        }

        // We won't wait for the database to finish, so we can send the response
        db.addHosts(dbHosts)
            .catch((err) => ApiError.log('Could not import hosts', {err, hosts}));
      }

      getBlockedServers((err, hashes) => {
        if (err) return next(err);
        if (!hashes) return next(new ErrorBuilder().notFound('List of blocked servers', true));

        const result: { [key: string]: boolean } = {};

        for (const key in hosts) {
          if (hosts.hasOwnProperty(key)) {
            result[key] = hashes.includes(hosts[key]);
          }
        }

        return setCaching(res, true, true, 60 * 15)
            .send(result);
      });
    }
  });
});

/* Helper */
function sendDownloadHeaders(res: Response, mimeType: string, download: boolean, fileIdentifier: string, fileExtension: string = 'png'): void {
  res.type(mimeType);

  if (download) {
    res.set('Content-Disposition', `attachment;filename=${fileIdentifier}.${fileExtension}`);
  }
}

export function getByUsername(username: string, at: number | string | null = null, callback: (err: Error | null, apiRes: { id: string, name: string } | null) => void): void {
  if (typeof at != 'number' || (at > Date.now())) {
    at = null;
  }

  const cacheKey = `${username.toLowerCase()};${at != null ? at : ''}`;

  const get = (callback: (err: Error | null, apiRes: { id: string, name: string } | null) => void) => {
    const cacheValue: { id: string, name: string } | Error | null | undefined = uuidCache.get(cacheKey);
    if (cacheValue == undefined) {
      getHttp(`https://api.mojang.com/users/profiles/minecraft/${username}${at != null ? `?at=${at}` : ''}`)
          .then((httpRes) => {
            if (httpRes.res.statusCode != 200 && httpRes.res.statusCode != 204) {
              ApiError.log(`Mojang returned ${httpRes.res.statusCode} on uuid lookup for ${username}(at=${at || 'null'})`);

              if (at != null) return callback(new ErrorBuilder().serverErr('The server got rejected with status 429', true), null); // Currently no fallback available accepting at-param

              // Contact fallback api (should not be necessary but is better than returning an 429 or 500)
              ApiError.log(`Contacting api.ashcon.app for username lookup: ${username}`);
              getHttp(`https://api.ashcon.app/mojang/v1/user/${username}`, false)
                  .then((httpRes) => {
                    if (httpRes.res.statusCode != 200 && httpRes.res.statusCode != 404) {
                      return callback(new ErrorBuilder().serverErr(`The server got rejected (${HttpError.getName(httpRes.res.statusCode) || httpRes.res.statusCode})`), null);
                    }
                    if (httpRes.res.statusCode == 404) return callback(null, null);

                    const json = JSON.parse(httpRes.body.toString('utf-8'));
                    const apiRes = {id: json.uuid.replace(/-/g, ''), name: json.username};
                    uuidCache.set(cacheKey, apiRes);  // TODO cache 404 and err
                    return callback(null, apiRes);
                  })
                  .catch((err) => {
                    callback(err, null);
                  });
            } else {
              const apiRes = httpRes.res.statusCode == 200 ? JSON.parse(httpRes.body.toString('utf-8')) : null;
              uuidCache.set(cacheKey, apiRes);

              callback(null, apiRes); // Not Found or Success
            }
          })
          .catch((err) => {
            uuidCache.set(cacheKey, err);
            return callback(err, null);
          });
    } else {
      if (!cacheValue) return callback(null, null); // Not Found
      if (cacheValue instanceof Error) return callback(cacheValue, null); // Error

      return callback(null, cacheValue); // Hit cache
    }
  };

  const task = {key: cacheKey, callback};

  let alreadyRunning = false;
  for (const elem of uuidRequestQueue) {
    if (elem.key == cacheKey) {
      alreadyRunning = true;
      break;
    }
  }
  uuidRequestQueue.push(task);

  if (!alreadyRunning) {
    get((err, apiRes) => {
      let i: number;
      do {
        i = uuidRequestQueue.findIndex((value) => value.key == cacheKey);

        if (i != -1) {
          uuidRequestQueue[i].callback(err, apiRes);
          uuidRequestQueue.splice(i, 1);
        }
      } while (i != -1);
    });
  }
}

export function getByUUID(uuid: string, req: Request | null, callback: (err: Error | null, user: MinecraftUser | null) => void, waitForImport: boolean = false): void {
  const get = (callback: (err: Error | null, user: MinecraftUser | null) => void) => {
    const cacheValue: MinecraftUser | Error | null | undefined = userCache.get(uuid);

    if (cacheValue == undefined) {
      const getNameHistory = function (mcUser: MinecraftProfile | null, callback: (err: Error | null, nameHistory: MinecraftNameHistoryElement[] | null) => void): void {
        if (!mcUser) return callback(null, null);

        const fallbackApiProfile = () => {
          getHttp(`https://api.ashcon.app/mojang/v2/user/${mcUser.id}`, false)  // FIXME: This api never returns legacy-field
              .then((httpRes) => {
                if (httpRes.res.statusCode != 200 && httpRes.res.statusCode != 404) {
                  return callback(new ErrorBuilder().serverErr(`The server got rejected (${HttpError.getName(httpRes.res.statusCode) || httpRes.res.statusCode})`, true), null);
                }
                if (httpRes.res.statusCode == 404) return callback(null, null);

                const result: MinecraftNameHistoryElement[] = [];
                for (const elem of JSON.parse(httpRes.body.toString('utf-8')).username_history) {
                  result.push({
                    name: elem.username,
                    changedToAt: elem.changed_at ? new Date(elem.changed_at).getTime() : undefined
                  });
                }

                return callback(null, result);
              })
              .catch((err) => callback(err, null));
        };

        // TODO: Reduce duplicate code
        if (rateLimitedNameHistory > 6) {
          // Contact fallback api (should not be necessary but is better than returning an 429 or 500
          ApiError.log(`Contacting api.ashcon.app for username history lookup: ${mcUser.id}`);

          fallbackApiProfile();
        } else {
          getHttp(`https://api.mojang.com/user/profiles/${mcUser.id}/names`)
              .then((httpRes) => {
                if (httpRes.res.statusCode != 200 && httpRes.res.statusCode != 204) {
                  // Contact fallback api (should not be necessary but is better than returning an 429 or 500
                  ApiError.log(`Mojang returned ${httpRes.res.statusCode} on name history lookup for ${mcUser.id}`);
                  rateLimitedNameHistory++;

                  fallbackApiProfile();
                } else {
                  const result: MinecraftNameHistoryElement[] = [];

                  if (httpRes.res.statusCode == 200) {
                    for (const elem of JSON.parse(httpRes.body.toString('utf-8'))) {
                      result.push({
                        name: elem.name,
                        changedToAt: elem.changedToAt
                      });
                    }
                  }

                  return callback(null, result);
                }
              })
              .catch((err) => callback(err, null));
        }
      };

      // TODO: hier bin ich grad (delete this line if you forgot what it is for)
      getHttp(`https://sessionserver.mojang.com/session/minecraft/profile/${uuid}?unsigned=false`)
          .then(async (httpRes) => {
            if (httpRes.res.statusCode != 200 && httpRes.res.statusCode != 204) {
              ApiError.log(`Mojang returned ${httpRes.res.statusCode} on profile lookup for ${uuid}`);

              let profile: MinecraftProfile | null = null;

              try {
                profile = await db.getProfile(uuid, true);
              } catch (err) {
                ApiError.log('Could not fetch profile from database', err);
              }

              if (profile) {
                getNameHistory(profile, (err, nameHistory) => {
                  if (err) return callback(err, null); // Error

                  getUserAgent(req)
                      .then((userAgent) => {
                        const mcUser = nameHistory ? new MinecraftUser(profile as MinecraftProfile, nameHistory, userAgent, true) : null;

                        if (mcUser) {
                          uuidCache.set(`${mcUser.name.toLowerCase()};`, {id: mcUser.id, name: mcUser.name});
                        }

                        if (waitForImport) {
                          userCacheWaitingForImportQueue.push({key: uuid, callback}); // Error, Not Found or Success
                        }

                        userCache.set(uuid, err || mcUser);

                        if (!waitForImport) return callback(err || null, mcUser); // Error, Not Found or Success
                      })
                      .catch((err) => callback(err, null));
                });
              } else {
                ApiError.log(`Contacting api.ashcon.app for profile lookup: ${uuid}`);

                // Contact fallback api (should not be necessary but is better than returning an 429 or 500
                getHttp(`https://api.ashcon.app/mojang/v2/user/${uuid}`, false) // FIXME: This api never returns legacy-field
                    .then((httpRes) => {
                      if (httpRes.res.statusCode != 200 && httpRes.res.statusCode != 404) {
                        return callback(new ErrorBuilder().serverErr(`The server got rejected (${HttpError.getName(httpRes.res.statusCode) || httpRes.res.statusCode})`, true), null);
                      }
                      if (httpRes.res.statusCode == 404) return callback(null, null);

                      const json = JSON.parse(httpRes.body.toString('utf-8'));

                      const nameHistory: MinecraftNameHistoryElement[] = [];
                      for (const elem of json.username_history) {
                        nameHistory.push({
                          name: elem.username,
                          changedToAt: elem.changed_at ? new Date(elem.changed_at).getTime() : undefined
                        });
                      }

                      getUserAgent(req)
                          .then((userAgent) => {
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
                            uuidCache.set(`${mcUser.name.toLowerCase()};`, {id: mcUser.id, name: mcUser.name});

                            if (waitForImport) {
                              userCacheWaitingForImportQueue.push({key: uuid, callback}); // Success
                            }

                            userCache.set(uuid, mcUser);

                            if (!waitForImport) return callback(null, mcUser); // Success
                          })
                          .catch((err) => callback(err, null));
                    })
                    .catch((err) => callback(err, null));
              }
            } else {
              const profile: MinecraftProfile | null = httpRes.res.statusCode == 200 ? JSON.parse(httpRes.body.toString('utf-8')) : null;

              getNameHistory(profile, (err, nameHistory) => {
                if (err) return callback(err, null); // Error

                getUserAgent(null)
                    .then((userAgent) => {
                      const mcUser = profile && nameHistory ? new MinecraftUser(profile, nameHistory, userAgent, true) : null;

                      if (mcUser) {
                        uuidCache.set(`${mcUser.name.toLowerCase()};`, {id: mcUser.id, name: mcUser.name});
                      }

                      if (waitForImport) {
                        userCacheWaitingForImportQueue.push({key: uuid, callback}); // Error, Not Found or Success
                      }

                      userCache.set(uuid, err || mcUser);

                      if (!waitForImport) return callback(err || null, mcUser); // Error, Not Found or Success
                    })
                    .catch((err) => callback(err, null));
              });
            }
          })
          .catch((err) => {
            userCache.set(uuid, err);
            return callback(err, null);
          });
    } else {
      if (!cacheValue) return callback(null, null); // Not Found
      if (cacheValue instanceof Error) return callback(cacheValue, null); // Error

      return callback(null, cacheValue); // Hit cache
    }
  };

  uuid = uuid.replace(/-/g, '').toLowerCase();
  const task = {key: uuid, callback};

  let alreadyRunning = false;
  for (const elem of profileRequestQueue) {
    if (elem.key == uuid) {
      alreadyRunning = true;
      break;
    }
  }
  profileRequestQueue.push(task);

  if (!alreadyRunning) {
    get((err, user) => {
      let i: number;
      do {
        i = profileRequestQueue.findIndex((value) => value.key == uuid);

        if (i != -1) {
          profileRequestQueue[i].callback(err, user);
          profileRequestQueue.splice(i, 1);
        }
      } while (i != -1);
    });
  }
}

export function isUUIDCached(uuid: string): boolean {
  return userCache.has(uuid.replace(/-/g, '').toLowerCase());
}

function getBlockedServers(callback: (err: Error | null, hashes: string[] | null) => void): void {
  getHttp(`https://sessionserver.mojang.com/blockedservers`, false)
      .then((httpRes) => {
        if (httpRes.res.statusCode != 200) return callback(null, null);

        let hashes = [];

        for (const hash of httpRes.body.toString('utf-8').split('\n')) {
          hashes.push(hash);
        }

        if (hashes[hashes.length - 1].trim() == '') {
          hashes.pop();
        }

        callback(null, hashes);
      })
      .catch((err) => callback(err, null));
}

// TODO put inside global and change the UserAgent-interface to an class
export async function getUserAgent(req: Request | null): Promise<UserAgent> {
  return new Promise((resolve, reject) => {
    if (!db.isAvailable()) return resolve({id: -1, name: 'SpraxAPI', internal: true});

    const agentName = req && req.headers['user-agent'] ? req.headers['user-agent'] : 'SpraxAPI',
        isInternalAgent = req ? !req.headers['user-agent'] : true;

    const cacheKey = `${agentName};${isInternalAgent}`;
    const cacheValue: UserAgent | undefined = userAgentCache.get(cacheKey);

    if (cacheValue != undefined) {
      return resolve(cacheValue); // Hit cache
    }

    db.getUserAgent(agentName, isInternalAgent)
        .then((userAgent) => {
          userAgentCache.set(cacheKey, userAgent);
          return resolve(userAgent);
        })
        .catch(reject);
  });
}

/**
 * @param skin A dirty skin (not from Image#toCleanSkin) with valid dimensions
 */
function renderSkin(skin: Image, area: SkinArea, overlay: boolean, alex: boolean | 'auto', is3d: boolean, size: number = 512, callback: (err?: Error, resultImg?: Buffer) => void) {
  if (!skin.hasSkinDimensions()) throw new Error('skin image does not have valid dimensions');

  if (typeof alex != 'boolean')
    alex = skin.isSlimSkinModel();

  skin.toCleanSkin((err) => {
    if (err) throw err;
    if (is3d) {
      let cam: Camera;
      let model: Model;

      if (area == SkinArea.BODY) {
        if (overlay) {
          cam = rendering.cams.body;
          model = alex ? rendering.models.modelAlex : rendering.models.modelSteve;
        } else {
          cam = rendering.cams.bodyNoOverlay;
          model = alex ? rendering.models.modelAlexNoOverlay : rendering.models.modelSteveNoOverlay;
        }
      } else {
        cam = overlay ? rendering.cams.head : rendering.cams.headNoOverlay;
        model = overlay ? rendering.models.modelSteveHead : rendering.models.modelSteveHeadNoOverlay;
      }

      if (!cam || !model) return callback(new Error(`This combination of SkinArea(=${area}), overlay(=${overlay}), alex(=${alex}) and is3d(=${is3d}) is not supported (please create an issue on GitHub)`));

      skin.resetSkinOverlayAlpha();

      return Image.fromRaw(Buffer.from(cam.render(model, skin.img.data)), cam.width, cam.height, 4, (err, img) => {
        if (err || !img) return callback(err || new Error());

        img.toPngBuffer(size, size)
            .then((png) => callback(undefined, png))
            .catch((err) => callback(err));
      });
    } else if (!is3d) {
      const dimensions: { x: number, y: number } =
          area == SkinArea.HEAD ? {x: 8, y: 8} : {x: 16, y: 32};

      Image.empty(dimensions.x, dimensions.y, (err, img) => {
        if (err || !img) throw err || new Error();

        const armWidth = alex ? 3 : 4,
            xOffset = alex ? 1 : 0;

        if (area == SkinArea.HEAD) {
          img.drawSubImg(skin, 8, 8, 8, 8, 0, 0, true);                       // Head
        } else if (area == SkinArea.BODY) {
          img.drawSubImg(skin, 8, 8, 8, 8, 4, 0, true);                       // Head

          img.drawSubImg(skin, 20, 20, 8, 12, 4, 8, true);                    // Body
          img.drawSubImg(skin, 44, 20, armWidth, 12, 0 + xOffset, 8, true);   // Right arm
          img.drawSubImg(skin, 36, 52, armWidth, 12, 12, 8, true);            // Left arm
        }

        if (area == SkinArea.BODY) {
          img.drawSubImg(skin, 4, 20, 4, 12, 4, 20, true);                    // Right leg
          img.drawSubImg(skin, 20, 52, 4, 12, 8, 20, true);                   // Left leg
        }

        if (overlay) {
          if (area == SkinArea.HEAD) {
            img.drawSubImg(skin, 40, 8, 8, 8, 0, 0, false, 'add');                    // Head (overlay)
          } else if (area == SkinArea.BODY) {
            img.drawSubImg(skin, 40, 8, 8, 8, 4, 0, false, 'add');                    // Head (overlay)

            img.drawSubImg(skin, 20, 36, 8, 12, 4, 8, false, 'add');                  // Body (overlay)
            img.drawSubImg(skin, 44, 36, armWidth, 12, 0 + xOffset, 8, false, 'add'); // Right arm (overlay)
            img.drawSubImg(skin, 52, 52, armWidth, 12, 12, 8, false, 'add');          // Left arm (overlay)
          }

          if (area == SkinArea.BODY) {
            img.drawSubImg(skin, 4, 36, 4, 12, 4, 20, false, 'add');                  // Right leg (overlay)
            img.drawSubImg(skin, 4, 52, 4, 12, 8, 20, false, 'add');                  // Left leg (overlay)
          }
        }

        return img.toPngBuffer(size, size)
            .then((png) => callback(undefined, png))
            .catch((err) => callback(err));
      });
    }
  });
}

function renderBlock(texture: Image, size: number = 512, callback: (err?: Error, resultImg?: Buffer) => void) {
  const cam = rendering.cams.block,
      model = rendering.models.block;

  return Image.fromRaw(Buffer.from(cam.render(model, texture.img.data)), cam.width, cam.height, 4, (err, img) => {
    if (err || !img) return callback(err || new Error());

    img.toPngBuffer(size, size)
        .then((png) => callback(undefined, png))
        .catch((err) => callback(err));
  });
}