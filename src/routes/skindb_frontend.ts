import { Router } from 'express';

import { db } from '..';
import { getByUUID, getByUsername } from './minecraft';
import { restful, isUUID, ErrorBuilder, isNumber, setCaching, ApiError } from '../utils/utils';
import { SkinDBAccount, SkinDBSkin, SkinDBSearch, SkinDBIndex, Skin } from '../global';

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

          db.getSkinTags(skin.id)
            .then((tags) => {
              db.getSkinAiTags(skin.id)
                .then((aiTags) => {
                  db.getSkinSeenOn(skin.id)
                    .then((seenOn) => {
                      const result: SkinDBSkin = {
                        skin,
                        tags,
                        aiTags,
                        seen_on: seenOn
                      };

                      setCaching(res, true, false, 60, 60)
                        .send(result);
                    })
                    .catch(next);
                })
                .catch(next);
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
      if (!req.query.q) return next(new ErrorBuilder().invalidParams('query', [{ param: 'q', condition: 'Valid string' }]));
      if (req.query.page && !isNumber(req.query.page as string)) return next(new ErrorBuilder().invalidParams('query', [{ param: 'page', condition: 'Valid number > 0' }]));

      const query = req.query.q as string;
      const page = typeof req.query.page == 'string' ? parseInt(req.query.page) : 1;

      if (page < 1) return next(new ErrorBuilder().invalidParams('query', [{ param: 'page', condition: 'Valid number > 0' }]));

      let directProfileHit: { name: string, id: string } | null = null,
        indirectProfileHits: { name: string, matched_name: string, id: string }[] = [];

      let skinHits: { skins: Skin[], moreAvailable: boolean } = { skins: [], moreAvailable: false };

      // TODO: name->uuid schlägt bei scheinbar ungültigen Namen fehl. Zusätzlich die Datenbank für direct-hits nutzen
      // TODO: Ergänzung zu oben: 'z' gibt nen indirect match zu 'Z' aber 'Z' nen direct zu 'Z'
      // TODO: name_history ebenfalls für indirect hits nutzen

      // Search for direct profile hits
      try {
        if (isUUID(query)) {
          directProfileHit = await new Promise((resolve, reject) => {
            getByUUID(query, req, (err, user) => {
              if (err) return reject(err);
              if (!user) return resolve(null);

              resolve({ id: user.id, name: user.name });
            });
          });
        } else if (query.length <= 16) {
          directProfileHit = await new Promise((resolve, reject) => {
            getByUsername(query, null, (err, apiRes) => {
              if (err) return reject(err);
              if (!apiRes) return resolve(null);

              getByUUID(apiRes.id, req, (err, user) => {
                if (err) return reject(err);
                if (!user) return resolve(null);

                resolve({ id: user.id, name: user.name });
              });
            });
          });
        }
      } catch (err) {
        ApiError.log('Could not search for profiles (direct)', { err, query });
      }

      if (query.length <= 16) {
        indirectProfileHits = (await db.searchProfile(query, 4, 0))
          .map((elem) => { return { name: elem.profile.name, matched_name: elem.matched_name, id: elem.profile.id }; })
          .filter((elem) => elem.id != directProfileHit?.id);

        if (indirectProfileHits.length == 4) {
          indirectProfileHits.pop();
        }
      }

      // Search for Tagged Skins
      try {
        skinHits = await db.getSkins(query.split(' '), 12, page * 12);
      } catch (err) {
        ApiError.log('Could not search for skins', { err, query });
      }

      // if (queryArgs[0].length <= 16) {
      //   try {
      //     const indirectHits = await db.searchProfile(queryArgs[0], 'start', 4, 0);

      //     for (const hit of indirectHits) {
      //       if (directProfileHit && directProfileHit.id == hit.id) continue;

      //       const profile = await new Promise<MinecraftUser>((resolve, reject) => {
      //         getByUUID(hit.id, req, (err, user) => {
      //           if (err || !user) return reject(err || new Error('WTF just happened? This should be dead-code'));

      //           resolve(user);
      //         });
      //       });

      //       if (profile.name.toLowerCase().indexOf(queryArgs[0].toLowerCase()) != -1) {
      //         indirectProfileHits.push({ id: profile.id, name: profile.name });
      //       }
      //     }
      //   } catch (err) {
      //     ApiError.log('Could not search for profiles (indirect)', err);
      //   }
      // }

      const result: SkinDBSearch = {
        profiles: {
          direct: directProfileHit,
          indirect: indirectProfileHits
        },
        skins: {
          hits: skinHits.skins,
          page,
          hasNextPage: skinHits.moreAvailable
        }
      };

      setCaching(res, true, false, 60, 60)
        .send(result);
    }
  });
});