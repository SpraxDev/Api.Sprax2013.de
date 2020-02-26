import request = require('request');
import fs = require('fs');
import { Router } from 'express';
import { restful, isUUID, toBoolean } from '../utils';
import { MinecraftProfile, MinecraftUser } from '../global';
import { db } from '../index';

const SKIN_STEVE = fs.readFileSync('./resources/steve.png'),
  SKIN_ALEX = fs.readFileSync('./resources/alex.png');

enum SkinType {
  HEAD, FRONT, BODY
};

const router = Router();
export const minecraftExpressRouter = router;

// Turn :user into uuid (without hyphenes)
router.param('user', (req, _res, next, value, name) => {
  if (typeof value != 'string') return next(new Error('Invalid parameter for user'));
  if (value.toLowerCase().endsWith('.png')) {
    value = value.substring(0, value.length - 4);
    req.params[name] = value;
  }

  if (isUUID(value)) {
    req.params[name] = value.replace(/-/g, '');
    next();
  } else if (value.length <= 16) {
    let at;

    if (req.query.at) {
      if (!(/^\d+$/.test(req.query.at))) return next(new Error('Invalid query-parameter for at'));
      at = req.query.at;
    }

    getByUsername(value, at, (err, apiRes) => {
      if (err) return next(new Error('500'));
      if (!apiRes) return next(new Error('Invalid parameter for user (username could not be fetched to an uuid)'));

      req.params[name] = apiRes.id;
      next();
    });
  } else {
    next(new Error('Invalid parameter for user'));
  }
});

/* Account Routes */
router.all('/profile/:user?', (req, res, next) => {
  restful(req, res, {
    get: () => {
      if (!req.params.user) return next(new Error('Invalid parameter for user'));

      getByUUID(req.params.user, (err, profile) => {
        if (err) return next(new Error('500'));
        if (!profile) return res.sendStatus(404);

        res.send(profile);
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

      getNameHistory(req.params.user, (err, apiRes) => {
        if (err) return next(new Error('500'));
        if (!apiRes) return res.sendStatus(404);

        res.send(apiRes);
      });
    }
  });
});

/* Skin Routes */
router.all('/skin/:user?', (req, res, next) => {  //TODO: Automatically upgrade skins from 64x32 to 64x64 and clean them. allow query param to prevent this behavior
  restful(req, res, {
    get: () => {
      if (!req.params.user) return next(new Error('Invalid parameter for user'));

      const download = req.query.download ? toBoolean(req.query.download) : false;
      const mimeType = download ? 'application/octet-stream' : 'png';

      getByUUID(req.params.user, (err, profile) => {
        if (err) return next(new Error('500'));
        if (!profile) return res.sendStatus(404);

        const mcUser = new MinecraftUser(profile);

        if (mcUser.skinURL) {
          request.get(mcUser.skinURL, { encoding: null }, (err, httpRes, httpBody) => {
            if (err) return next(new Error('500'));

            res.type(mimeType);
            if (download) {
              res.set('Content-Disposition', `attachment;filename=${profile.name}.png`);
            }

            if (httpRes.statusCode == 200) {
              res.send(httpBody);
            } else {
              res.send(mcUser.isAlexDefaultSkin() ? SKIN_ALEX : SKIN_STEVE);
            }
          });
        } else {
          res.type(mimeType);
          if (download) {
            res.set('Content-Disposition', `attachment;filename=${profile.name}.png`);
          }

          res.send(mcUser.isAlexDefaultSkin() ? SKIN_ALEX : SKIN_STEVE);
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
function getByUsername(username: string, at: number | null, callback: (err: Error | null, apiRes: { id: string, name: string } | null) => void): void {
  if (typeof at != 'number' || (typeof at == 'number' && at > Date.now())) {
    at = null;
  }

  request.get(`https://api.mojang.com/users/profiles/minecraft/${username}${at != null ? `?at=${at}` : ''}`, {}, (err, httpRes, httpBody) => {
    if (err) return callback(err, null);

    if (httpRes.statusCode != 200 && httpRes.statusCode != 204) {
      console.error(`Mojang returned ${httpRes.statusCode} on uuid lookup for ${username}(at=${at || 'null'})`);  //TODO: log to file

      if (at != null) return callback(err || new Error('Too many requests'), null); // Currently no fallback available accepting at-param

      // Contact fallback api
      request.get(`https://api.ashcon.app/mojang/v1/user/${username}`, {}, (err, httpRes, httpBody) => {
        if (err || (httpRes.statusCode != 200 && httpRes.statusCode != 404)) return callback(err || new Error('Too many requests'), null);
        if (httpRes.statusCode == 404) return callback(null, null);

        const json = JSON.parse(httpBody);
        return callback(null, {
          id: json.uuid.replace(/-/g, ''),
          name: json.username
        });
      });
    } else {
      if (httpRes.statusCode == 200) {
        const apiRes = JSON.parse(httpBody);
        callback(null, apiRes);

        if (at == null) {
          db.updateUUID(apiRes, (err) => {
            if (err) return console.error(err);  //TODO: log to file
          });
        }
      } else {
        callback(null, null);
      }
    }
  });
}

function getByUUID(uuid: string, callback: (err: Error | null, profile: MinecraftProfile | null) => void): void {
  request.get(`https://sessionserver.mojang.com/session/minecraft/profile/${uuid}?unsigned=false`, {}, (err, httpRes, httpBody) => {
    if (err) return callback(err, null);

    if (httpRes.statusCode != 200 && httpRes.statusCode != 204) {
      console.error(`Mojang returned ${httpRes.statusCode} on profile for ${uuid}`);  //TODO: log to file

      // Contact fallback api
      request.get(`https://api.ashcon.app/mojang/v2/user/${uuid}`, {}, (err, httpRes, httpBody) => {  // FIXME: This api never returns legacy-field
        if (err || (httpRes.statusCode != 200 && httpRes.statusCode != 404)) return callback(err || new Error('Too many requests'), null);
        if (httpRes.statusCode == 404) return callback(null, null);

        const json = JSON.parse(httpBody);
        return callback(null, {
          id: json.uuid.replace(/-/g, ''),
          name: json.username,
          properties: [
            {
              name: 'textures',
              value: json.textures.raw.value,
              signature: json.textures.raw.signature
            }
          ]
        });
      });
    } else {
      if (httpRes.statusCode == 200) {
        const profile = JSON.parse(httpBody);
        callback(null, profile);

        db.updateProfile(profile, (err) => {
          if (err) return console.error(err);  //TODO: log to file
        });
      } else {
        callback(null, null);
      }
    }
  });
}

function getNameHistory(uuid: string, callback: (err: Error | null, apiRes: { name: string, changedToAt?: number }[] | null) => void): void {
  request.get(`https://api.mojang.com/user/profiles/${uuid}/names`, {}, (err, httpRes, httpBody) => {
    if (err) return callback(err, null);

    if (httpRes.statusCode != 200 && httpRes.statusCode != 204) {
      console.error(`Mojang returned ${httpRes.statusCode} on name history for ${uuid}`);  //TODO: log to file

      // Contact fallback api
      request.get(`https://api.ashcon.app/mojang/v2/user/${uuid}`, {}, (err, httpRes, httpBody) => {
        if (err || (httpRes.statusCode != 200 && httpRes.statusCode != 404)) return callback(err || new Error('Too many requests'), null);
        if (httpRes.statusCode == 404) return callback(null, null);

        const jsonArr = JSON.parse(httpBody).username_history,
          result: { name: string, changedToAt?: number }[] = [];

        for (const elem of jsonArr) {
          result.push({
            name: elem.username,
            changedToAt: elem.changed_at ? new Date(elem.changed_at).getTime() : undefined
          });
        }

        return callback(null, result);
      });
    } else {
      if (httpRes.statusCode == 200) {
        const apiRes = JSON.parse(httpBody);
        callback(null, apiRes);

        db.updateNameHistory(uuid, apiRes, (err) => {
          if (err) return console.error(err);  //TODO: log to file
        });
      } else {
        callback(null, null);
      }
    }
  });
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