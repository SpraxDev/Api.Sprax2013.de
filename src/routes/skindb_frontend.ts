import { Router } from 'express';

import { restful, isUUID, ErrorBuilder, isNumber, setCaching, ApiError } from '../utils';
import { db } from '..';
import { SkinDBAccount, SkinDBSkin, MinecraftUser, SkinDBSearch, SkinDBIndex } from '../global';
import { getByUUID, getByUsername } from './minecraft';

/* Routes */
const router = Router();
export const skindbFrontendExpressRouter = router;

//TODO: Check API-Token
// router.use((req, res, next) => {
// if (invalidApiToken) next(new ErrorBuilder().noPermsAuthorizedOrSomething);
//
// next(); // valid API-Token
// });

router.all('/index', (req, res, next) => {
  restful(req, res, {
    get: () => {
      if (!db.isAvailable()) return next(new ErrorBuilder().serviceUnavailable('SkinDB-Frontend route can only work while using a database'));

      db.getMostUsedSkinsLast7Days()
        .then((skins) => {
          if (!skins) return next(new ErrorBuilder().notFound('skin for that id'));

          const result: SkinDBIndex = {
            top_ten: skins
          };

          setCaching(res, true, false, 60, 60)
            .send(result);
        })
        .catch(next);
    }
  });
});

router.all('/account/:uuid', (req, res, next) => {
  restful(req, res, {
    get: () => {
      if (!db.isAvailable()) return next(new ErrorBuilder().serviceUnavailable('SkinDB-Frontend route can only work while using a database'));
      if (!isUUID(req.params.uuid)) return next(new ErrorBuilder().invalidParams('url', [{ param: 'uuid', condition: 'Valid UUID v4' }]));

      const uuid: string = req.params.uuid.toLowerCase().replace(/-/g, '');

      getByUUID(uuid, req, async (err, user) => {
        if (err || !user) return next(err || new Error());

        const history: number[] = await db.getSkinHistory(uuid, 10, 0);
        const historyTotal = history.length < 10 ? history.length : await db.getSkinHistorySize(uuid);

        const result: SkinDBAccount = {
          user: user.toCleanJSON(),
          skinHistory: {
            lastTen: history,
            total: historyTotal
          }
        };

        setCaching(res, true, false, 60, 60)
          .send(result);
      }, true);
    }
  });
});

router.all('/skin/:skinID', (req, res, next) => {
  restful(req, res, {
    get: () => {
      if (!db.isAvailable()) return next(new ErrorBuilder().serviceUnavailable('SkinDB-Frontend route can only work while using a database'));
      if (!isNumber(req.params.skinID)) return next(new ErrorBuilder().invalidParams('url', [{ param: 'skinID', condition: 'Numeric string' }]));

      db.getSkin(req.params.skinID)
        .then((skin) => {
          if (!skin) return next(new ErrorBuilder().notFound('skin for that id'));

          db.getSkinSeenOn(skin.id)
            .then((seenOn) => {
              const result: SkinDBSkin = {
                skin,
                seen_on: seenOn
              };

              setCaching(res, true, false, 60, 60)
                .send(result);
            })
            .catch(next);
        })
        .catch(next);
    }
  });
});

router.all('/search', (req, res, next) => {
  restful(req, res, {
    get: async () => {
      if (!db.isAvailable()) return next(new ErrorBuilder().serviceUnavailable('SkinDB-Frontend route can only work while using a database'));
      if (!req.body || !req.body.query) return next(new ErrorBuilder().invalidBody([{ param: 'query', condition: 'Valid string' }]));

      const query: string = req.body.query,
        queryArgs = query.split(' ');

      let directProfileHit: { name: string, id: string } | null = null,
        indirectProfileHits: { name: string, id: string }[] = [];

      try {
        if (isUUID(query)) {
          directProfileHit = await new Promise((resolve, reject) => {
            getByUUID(query, req, (err, user) => {
              if (err || !user) return reject(err || new Error('WTF just happened? This should be dead-code'));

              resolve({ name: user.name, id: user.id });
            }, true);
          });
        } else if (query.length <= 16) {
          directProfileHit = await new Promise<{ name: string, id: string }>((resolve, reject) => {
            getByUsername(query, null, (err, apiRes) => {
              if (err || !apiRes) return reject(err || new Error('WTF just happened? This should be dead-code'));

              getByUUID(apiRes.id, req, (err, user) => {
                if (err || !user) return reject(err || new Error('WTF just happened? This should be dead-code'));

                resolve({ name: user.name, id: user.id });
              }, true);
            });
          });
        }
      } catch (err) {
        ApiError.log('Could not search for profiles (direct)', err);
      }

      try {
        if (queryArgs[0].length <= 16) {
          const indirectHits = await db.searchProfile(queryArgs[0], 'start', 5, 0);

          for (const hit of indirectHits) {
            const profile = await new Promise<MinecraftUser>((resolve, reject) => {
              getByUUID(hit.id, req, (err, user) => {
                if (err || !user) return reject(err || new Error('WTF just happened? This should be dead-code'));

                resolve(user);
              }, true);
            });

            if (profile.name.toLowerCase().indexOf(queryArgs[0].toLowerCase()) != -1) {
              indirectProfileHits.push({ id: profile.id, name: profile.name });
            }
          }
        }
      } catch (err) {
        ApiError.log('Could not search for profiles (indirect)', err);
      }

      const result: SkinDBSearch = {
        profiles: {
          direct: directProfileHit,
          indirect: indirectProfileHits
        }
      };

      setCaching(res, true, false, 60, 60)
        .send(result);
    }
  });
});