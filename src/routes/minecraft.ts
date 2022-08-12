// TODO: File is WAY too large
import nCache = require('node-cache');
import { Request, Response, Router } from 'express';
import { readFileSync } from 'fs';
import { isIPv4 } from 'net';
import { join as joinPath } from 'path';

import { CapeType, MinecraftUser, SkinArea, UserAgent } from '../global';
import { cache, db } from '../index';
import { Camera, createCamera, createModel, Model } from '../utils/modelRender';
import { importCapeByURL } from '../utils/skindb';
import {
  ApiError,
  convertFQDNtoASCII,
  ErrorBuilder,
  generateHash,
  getFileNameFromURL,
  Image,
  isHttpURL,
  isNumeric,
  isUUID,
  isValidFQDN,
  restful,
  setCaching,
  toBoolean,
  toInt
} from '../utils/utils';
import { httpGet } from '../utils/web';

/* key: ${userAgent};${internal(boolean)}, value: UserAgent */
const userAgentCache = new nCache({
  stdTTL: 10 * 60,
  useClones: false
});

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

const SKIN_STEVE = readFileSync(joinPath(__dirname, '..', '..', 'resources', 'steve.png')),
    SKIN_ALEX = readFileSync(joinPath(__dirname, '..', '..', 'resources', 'alex.png'));

const router = Router();
export const minecraftExpressRouter = router;

// Turn :user into uuid (without hyphens) or if :user == x-url check if query-param url is valid
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

      req.params[name] = value.toLowerCase();
      next();
    } else {  // Normal request
      const queryAt = req.query.at;
      let at: number | undefined;

      if (req.query.at) {
        if (typeof queryAt != 'string' || !isNumeric(queryAt)) {
          return next(new ErrorBuilder().invalidParams('query', [{
            param: 'at',
            condition: 'Is numeric string (0-9)'
          }]));
        }

        at = Number.parseInt(queryAt);
      }

      cache.getUUID(value, at)
          .then((uuid) => {
            if (!uuid) return next(new ErrorBuilder().notFound('UUID for given username'));

            req.params[name] = uuid.id;

            next();
          })
          .catch(next);
    }
  } else if (isUUID(value)) {
    cache.getProfile(value)
        .then((profile) => {
          if (!profile) return next(new ErrorBuilder().notFound('Profile for given uuid'));

          req.params[name] = profile.id;

          next();
        })
        .catch(next);
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
router.all<{ name?: string }>('/uuid/:name?', (req, res, next) => {
  restful(req, res, {
    get: async (): Promise<void> => {
      const name = req.params.name;

      if (!name || name.length == 0) {
        return next(new ErrorBuilder().invalidParams('url', [{
          param: 'name',
          condition: 'name.length > 0'
        }]));
      }

      const queryAt = req.query.at;
      let at: number | undefined;

      if (queryAt) {
        if (typeof queryAt != 'string' || !isNumeric(queryAt)) {
          return next(new ErrorBuilder().invalidParams('query', [{
            param: 'at',
            condition: 'Is numeric string (0-9)'
          }]));
        }

        at = Number.parseInt(queryAt);
      }

      try {
        res.locals.timings?.startNext('cacheNameToUUID');

        const uuid = await cache.getUUID(name, at);
        if (!uuid) return next(new ErrorBuilder().notFound('UUID for given username'));

        setCaching(res, true, true, 60).send(uuid);
      } catch (err) {
        return next(err);
      }
    }
  });
});

router.all<{ nameOrId?: string }>('/profile/:nameOrId?', (req, res, next) => {
  restful(req, res, {
    get: async (): Promise<void> => {
      const nameOrId = req.params.nameOrId;

      if (typeof nameOrId != 'string' || nameOrId.length == 0) {
        return next(new ErrorBuilder().invalidParams('url', [{
          param: 'user',
          condition: 'user.length > 0'
        }]));
      }

      const full = typeof req.query.raw == 'string' ? !toBoolean(req.query.raw) :
          typeof req.query.full == 'string' ? toBoolean(req.query.full) : false;

      /* nameOrId->profile */

      let result: object | undefined | null;

      try {
        if (full) {
          res.locals.timings?.startNext('cacheWholeUser');
          const user = await cache.getUser(nameOrId);

          if (user) {
            res.locals.timings?.startNext('convertToStr');
            result = user.toCleanJSON();
          }
        } else {
          let uuid: string | undefined = nameOrId;

          if (!isUUID(uuid)) {
            res.locals.timings?.startNext('cacheNameToUUID');
            uuid = (await cache.getUUID(nameOrId))?.id;
          }

          if (uuid) {
            res.locals.timings?.startNext('cacheUuidToProfile');
            result = await cache.getProfile(uuid.trim());
          }
        }

        res.locals.timings?.stopCurrent();
      } catch (err) {
        return next(err);
      }

      /* Send response */

      if (!result) return next(new ErrorBuilder().notFound('Profile for given user'));

      setCaching(res, true, true, 60)
          .send(result);
    }
  });
});

router.all<{ nameOrId?: string }>('/history/:nameOrId?', (req, res, next) => {
  restful(req, res, {
    get: async (): Promise<void> => {
      const nameOrId = req.params.nameOrId;

      if (typeof nameOrId != 'string' || nameOrId.length == 0) {
        return next(new ErrorBuilder().invalidParams('url', [{
          param: 'user',
          condition: 'user.length > 0'
        }]));
      }

      /* nameOrId->name_history */

      let result: object | undefined | null;

      try {
        let uuid: string | undefined = nameOrId;

        if (!isUUID(uuid)) {
          res.locals.timings?.startNext('cacheNameToUUID');
          uuid = (await cache.getUUID(nameOrId))?.id;
        }

        if (uuid) {
          res.locals.timings?.startNext('cacheUuidToNameHistory');
          result = await cache.getNameHistory(uuid);
        }

        res.locals.timings?.stopCurrent();
      } catch (err) {
        return next(err);
      }

      /* Send response */

      if (!result) return next(new ErrorBuilder().notFound('Profile for given user'));

      setCaching(res, true, true, 60)
          .send(result);
    }
  });
});

/* Skin Routes */
router.all<{ user?: string }>('/skin/:user?', (req, res, next) => {
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
        cache.getProfile(req.params.user)
            .then(async (profile): Promise<void> => {
              if (!profile) return next(new ErrorBuilder().notFound('Profile for given user', true));

              const user = new MinecraftUser(profile, [], await getUserAgent(null));
              const skinURL = user.getSecureSkinURL();

              if (skinURL) {
                httpGet(skinURL)
                    .then((httpRes) => {
                      if (httpRes.res.status == 200) {
                        if (!raw) {
                          Image.fromImg(httpRes.body, (err, img) => {
                            if (err || !img) return next(err);

                            img.toCleanSkinBuffer()
                                .then((png) => {
                                  sendDownloadHeaders(res, mimeType, download, profile.name);
                                  setCaching(res, true, true, 60).send(png);
                                })
                                .catch(next);
                          });
                        } else {
                          sendDownloadHeaders(res, mimeType, download, profile.name);
                          setCaching(res, true, true, 60).send(httpRes.body);
                        }
                      } else {
                        if (httpRes.res.status != 404) ApiError.log(`${skinURL} returned HTTP-Code ${httpRes.res.status}`);

                        sendDownloadHeaders(res, mimeType, download, profile.name);

                        setCaching(res, true, true, 60).send(user.isAlexDefaultSkin() ? SKIN_ALEX : SKIN_STEVE);
                      }
                    })
                    .catch(next);
              } else {
                sendDownloadHeaders(res, mimeType, download, profile.name);

                setCaching(res, true, true, 60).send(user.isAlexDefaultSkin() ? SKIN_ALEX : SKIN_STEVE);
              }
            })
            .catch(next);
      } else {
        const skinURL: string = MinecraftUser.getSecureURL(req.query.url as string);

        httpGet(skinURL)
            .then((httpRes) => {
              if (httpRes.res.status == 200) {
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

router.all<{ user?: string, skinArea?: string, '3d'?: string }>('/skin/:user?/:skinArea?/:3d?', (req, res, next) => {
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
        cache.getProfile(req.params.user)
            .then(async (profile): Promise<void> => {
              if (!profile) return next(new ErrorBuilder().notFound('Profile for given user', true));

              const user = new MinecraftUser(profile, [], await getUserAgent(null));

              const skinURL = user.getSecureSkinURL();

              if (skinURL) {

                httpGet(skinURL)
                    .then((httpRes) => {
                      if (httpRes.res.status != 200 && httpRes.res.status != 404) ApiError.log(`${skinURL} returned HTTP-Code ${httpRes.res.status}`);

                      const skinBuffer: Buffer = httpRes.res.status == 200 ? httpRes.body : (user.isAlexDefaultSkin() ? SKIN_ALEX : SKIN_STEVE);

                      Image.fromImg(skinBuffer, (err, img) => {
                        if (err || !img) return next(err || new Error());

                        renderSkin(img, skinArea, overlay, typeof slimModel == 'boolean' ? slimModel : user.modelSlim, is3D, size, (err, png) => {
                          if (err || !png) return next(err || new Error());

                          sendDownloadHeaders(res, mimeType, download, `${profile.name}-${skinArea.toLowerCase()}`);
                          setCaching(res, true, true, 60).send(png);
                        });
                      });
                    })
                    .catch(next);
              } else {
                Image.fromImg(user.isAlexDefaultSkin() ? SKIN_ALEX : SKIN_STEVE, (err, img) => {
                  if (err || !img) return next(err || new Error());

                  renderSkin(img, skinArea, overlay, typeof slimModel == 'boolean' ? slimModel : 'auto', is3D, size, (err, png) => {
                    if (err || !png) return next(err || new Error());

                    sendDownloadHeaders(res, mimeType, download, `${profile.name}-${skinArea.toLowerCase()}`);
                    setCaching(res, true, true, 60).send(png);
                  });
                });
              }
            })
            .catch(next);
      } else {
        const skinURL: string = MinecraftUser.getSecureURL(req.query.url as string);

        // TODO: Fetch from db instead of url
        // if (skinURL.toLowerCase().startsWith('https://cdn.skindb.net/skins/')) {
        // }

        httpGet(skinURL)
            .then((httpRes) => {
              if (httpRes.res.status == 200) {
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
      const body = req.body;

      if ((req.headers['content-type'] || '').toLowerCase() != 'image/png') {
        return next(new ErrorBuilder().invalidBody([{
          param: 'Content-Type',
          condition: 'image/png'
        }]));
      }
      if (!(body instanceof Buffer)) {
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

      Image.fromImg(body, (err, img) => {
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

            sendDownloadHeaders(res, mimeType, download, `block-${body.length}`);
            setCaching(res, false, false).send(png);
          });
        });
      });
    }
  });
});

/* Cape Routes */
router.all<{ user?: string }>('/capes/all/:user?', (req, res, next) => {
  restful(req, res, {
    get: () => {
      if (!req.params.user) {
        return next(new ErrorBuilder().invalidParams('url', [{
          param: 'user',
          condition: 'user.length > 0'
        }]));
      }

      cache.getProfile(req.params.user)
          .then(async (profile): Promise<void> => {
            if (!profile) return next(new ErrorBuilder().notFound('Profile for given user', true));

            const userAgent = await getUserAgent(req);
            const user = new MinecraftUser(profile, [], await getUserAgent(null));

            try {
              const labyCape = await importCapeByURL(user, CapeType.LABYMOD, userAgent);
              const optiFineCape = await importCapeByURL(user.getOptiFineCapeURL(), CapeType.OPTIFINE, await getUserAgent(req));

              const mojangCapeURL = user.getSecureCapeURL();
              const mojangCape = mojangCapeURL ? await importCapeByURL(mojangCapeURL, CapeType.MOJANG, await getUserAgent(req)) : null;

              setCaching(res, true, true, 60)
                  .send({
                    Mojang: mojangCape?.id || null,
                    OptiFine: optiFineCape?.id || null,
                    LabyMod: labyCape?.id || null
                  });
            } catch (err) {
              next(err);
            }
          })
          .catch(next);
    }
  });
});

router.all<{ capeType: string, user?: string }>('/capes/:capeType/:user?', (req, res, next) => {
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

      cache.getProfile(req.params.user)
          .then(async (profile): Promise<void> => {
            if (!profile) return next(new ErrorBuilder().notFound('Profile for given user', true));

            const user = new MinecraftUser(profile, [], await getUserAgent(null));

            const capeType = req.params.capeType as CapeType;
            const capeURL = capeType == CapeType.MOJANG ? user.getSecureCapeURL() :
                capeType == CapeType.OPTIFINE ? user.getOptiFineCapeURL() :
                    capeType == CapeType.LABYMOD ? CapeType.LABYMOD : null;

            if (capeURL == CapeType.LABYMOD) {
              user.fetchLabyModCape()
                  .then((labyCape) => {
                    if (labyCape == null) {
                      return next(new ErrorBuilder().notFound('User does not have a cape for that type'));
                    } else {
                      res.type(mimeType);
                      if (download) {
                        res.set('Content-Disposition', `attachment;filename=${profile.name}.png`);
                      }

                      setCaching(res, true, true, 60).send(labyCape);
                    }
                  })
                  .catch(next);
            } else if (capeURL) {
              httpGet(capeURL)
                  .then((httpRes) => {
                    if (httpRes.res.status == 200) {
                      res.type(mimeType);
                      if (download) {
                        res.set('Content-Disposition', `attachment;filename=${profile.name}.png`);
                      }

                      setCaching(res, true, true, 60).send(httpRes.body);
                    } else {
                      if (httpRes.res.status != 404) ApiError.log(`${capeURL} returned HTTP-Code ${httpRes.res.status}`);

                      return next(new ErrorBuilder().notFound('User does not have a cape for that type'));
                    }
                  })
                  .catch(next);
            } else {
              return next(new ErrorBuilder().notFound('User does not have a cape for that type'));
            }
          })
          .catch(next);
    }
  });
});

router.all<{ capeType: string, user?: string }>('/capes/:capeType/:user?/render', (req, res, next) => {
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
        cache.getProfile(req.params.user)
            .then(async (profile): Promise<void> => {
              if (!profile) return next(new ErrorBuilder().notFound('Profile for given user', true));

              const user = new MinecraftUser(profile, [], await getUserAgent(null));

              const capeURL = capeType == CapeType.MOJANG ? user.getSecureCapeURL() :
                  capeType == CapeType.OPTIFINE ? user.getOptiFineCapeURL() :
                      capeType == CapeType.LABYMOD ? CapeType.LABYMOD : null;

              if (capeURL == CapeType.LABYMOD) {
                user.fetchLabyModCape()
                    .then((labyCape) => {
                      if (labyCape == null) return next(new ErrorBuilder().notFound('User does not have a cape for that type'));

                      renderCape(labyCape, capeType, size, (err, png) => {
                        if (err || !png) return next(err);

                        sendDownloadHeaders(res, mimeType, download, `${profile.name}-${capeType.toLowerCase()}`);
                        setCaching(res, true, true, 60).send(png);
                      });
                    })
                    .catch(next);
              } else if (capeURL) {
                httpGet(capeURL)
                    .then((httpRes) => {
                      if (httpRes.res.status != 200 && httpRes.res.status != 404) ApiError.log(`${capeURL} returned HTTP-Code ${httpRes.res.status}`);
                      if (httpRes.res.status != 200) return next(new ErrorBuilder().notFound('User does not have a cape for that type'));

                      renderCape(httpRes.body, capeType, size, (err, png) => {
                        if (err || !png) return next(err);

                        sendDownloadHeaders(res, mimeType, download, `${profile.name}-${capeType.toLowerCase()}`);
                        setCaching(res, true, true, 60).send(png);
                      });
                    })
                    .catch(next);
              } else {
                return next(new ErrorBuilder().notFound('User does not have a cape for that type'));
              }
            })
            .catch(next);
      } else {
        const capeURL: string = MinecraftUser.getSecureURL(req.query.url as string);

        httpGet(capeURL)
            .then((httpRes) => {
              if (httpRes.res.status == 200) {
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
      cache.getBlockedServers()
          .then((hashes) => {
            setCaching(res, true, true, 60 * 2).send(hashes);
          })
          .catch(next);
    }
  });
});

router.all('/servers/blocked/known', (req, res, next) => {
  restful(req, res, {
    get: () => {
      cache.getBlockedServers()
          .then((hashes) => {
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
          })
          .catch(next);
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

      cache.getBlockedServers()
          .then((hashes) => {
            const result: { [key: string]: boolean } = {};

            for (const key in hosts) {
              if (hosts.hasOwnProperty(key)) {
                result[key] = hashes.includes(hosts[key]);
              }
            }

            return setCaching(res, true, true, 60 * 15)
                .send(result);
          })
          .catch(next);
    }
  });
});

// TODO: Allow clients to import any raw data related to profiles and/or skins (Used by SkinDB too)
// router.all('/import', (req, res, next) => {
//   // user (uuid, name), texture-value (+signature), file(s), URL
//
//   restful(req, res, {
//     post: () => {
//       const contentType = (req.headers['content-type'] || '').toLowerCase();
//
//       if (contentType == 'image/png') {
//         if (!(req.body instanceof Buffer)) {
//           return next(new ErrorBuilder().invalidBody([{
//             param: 'body',
//             condition: 'Valid png under 3MB'
//           }]));
//         }
//
//         Image.fromImg(req.body, (err, img) => {
//           if (err || !img) return next(new ErrorBuilder().invalidBody([{param: 'body', condition: 'Valid png'}]));
//           if (!img.hasSkinDimensions()) {
//             return next(new ErrorBuilder().invalidBody([{
//               param: 'body',
//               condition: 'Valid minecraft skin dimensions 64x32px or 64x64px'
//             }]));
//           }
//
//           getUserAgent(req)
//               .then((userAgent) => {
//                 importSkinByBuffer(req.body, null, userAgent, (err, skin, exactMatch) => {
//                   if (err || !skin) return next(err || new ErrorBuilder().serverErr(undefined, `Could not import uploaded skin by Buffer`));
//
//                   return setCaching(res, false, false)
//                       .status(exactMatch ? 200 : 201)
//                       .send({
//                         result: exactMatch ? 'Skin already in database' : 'Skin added to database',
//                         skinID: skin.id
//                       });
//                 });
//               })
//               .catch(next);
//         });
//       } else if (contentType == 'application/json') {
//         const json: { url?: string, raw?: { value: string, signature?: string } } = req.body;
//
//         if (json.raw) {
//           if (!json.raw.value) {
//             return next(new ErrorBuilder().invalidBody([{
//               param: 'JSON-Body: json.raw.value',
//               condition: 'Valid skin value from mojang profile'
//             }]));
//           }
//
//           if (json.raw.signature && !isFromYggdrasil(json.raw.value, json.raw.signature)) json.raw.signature = undefined;
//
//           getUserAgent(req)
//               .then((userAgent) => {
//                 if (!json.raw) return next(new ErrorBuilder().unknown());  // FIXME: why does TypeScript need this line? o.0
//
//                 importByTexture(json.raw.value, json.raw.signature || null, userAgent)
//                     .then((result) => {
//                       return setCaching(res, false, false)
//                           .status(202) // TODO report if skin added to db or already was in db
//                           .send({
//                             result: null, // TODO report if skin added to db or already was in db
//                             skinID: result.skin?.id
//                           });
//                     })
//                     .catch((err) => {
//                       next(err);
//                     });
//               })
//               .catch(next);
//         } else if (json.url) {
//           if (!MinecraftUser.getSecureURL(json.url).toLowerCase().startsWith('https://textures.minecraft.net/texture/')) {
//             return next(new ErrorBuilder().invalidBody([{
//               param: 'JSON-Body: json.url',
//               condition: 'Valid textures.minecraft.net URL'
//             }]));
//           }
//
//           db.getSkinByURL(MinecraftUser.getSecureURL(json.url).toLowerCase())
//               .then((skin) => {
//                 if (!skin) {
//                   getUserAgent(req)
//                       .then((userAgent) => {
//                         if (!json.url) return next(new ErrorBuilder().unknown());  // FIXME: why does TypeScript need this line? o.0
//
//                         importSkinByURL(MinecraftUser.getSecureURL(json.url), userAgent, (err, skin, exactMatch) => {
//                           if (err || !skin) return next(err || new ErrorBuilder().serverErr(undefined, `Could not import skin-URL`));
//
//                           return setCaching(res, false, false)
//                               .status(exactMatch ? 200 : 201)
//                               .send({
//                                 result: exactMatch ? 'Skin already in database' : 'Skin added to database',
//                                 skinID: skin.id
//                               });
//                         });
//                       })
//                       .catch(next);
//                 } else {
//                   return setCaching(res, false, false)
//                       .status(200)
//                       .send({
//                         result: 'Skin already in database',
//                         skinID: skin.id
//                       });
//                 }
//               })
//               .catch(next);
//         } else {
//           return next(new ErrorBuilder().invalidBody([]));  //TODO
//         }
//       } else {
//         return next(new ErrorBuilder().invalidBody([]));  //TODO
//       }
//     }
//   });
// });

/* Helper */
function sendDownloadHeaders(res: Response, mimeType: string, download: boolean, fileIdentifier: string, fileExtension: string = 'png'): void {
  res.type(mimeType);

  if (download) {
    res.set('Content-Disposition', `attachment;filename=${fileIdentifier}.${fileExtension}`);
  }
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
 * A dirty skin (not from Image#toCleanSkin) with valid dimensions
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
