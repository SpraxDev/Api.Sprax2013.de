import { Router } from 'express';

import { db } from '..';
import { getByUUID, getByUsername } from './minecraft';
import { restful, isUUID, ErrorBuilder, isNumber, setCaching, ApiError } from '../utils/utils';
import { SkinDBAccount, SkinDBSkin, SkinDBSearch, SkinDBIndex, Skin, SkinDBSkins } from '../global';

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

router.all('/skin/:skinID/vote', (req, res, next) => {
  restful(req, res, {
    post: () => {
      if (!db.isAvailable()) return next(new ErrorBuilder().serviceUnavailable('SkinDB-Frontend route can only work while using a database'));
      if (!isNumber(req.params.skinID)) return next(new ErrorBuilder().invalidParams('url', [{ param: 'skinID', condition: 'Numeric string' }]));

      // Check for valid body
      const invalidBody: { param: string, condition: string }[] = [];
      if (!req.body.user || !isUUID(req.body.user)) invalidBody.push({ param: 'user', condition: 'Valid UUID v4' });
      if (typeof req.body.tag != 'string') invalidBody.push({ param: 'tag', condition: 'String value' });
      if (typeof req.body.vote != 'boolean') invalidBody.push({ param: 'vote', condition: 'Boolean value' });
      if (invalidBody.length > 0) return next(new ErrorBuilder().invalidBody(invalidBody));

      db.getSkin(req.params.skinID)
        .then((skin) => {
          if (!skin) return next(new ErrorBuilder().notFound('skin for that id'));

          db.getTag(req.body.tag)
            .then((tag) => {
              if (!tag) return next(new ErrorBuilder().notFound('tag for that name'));

              db.setSkinVote(req.body.user, skin.id, tag.id, req.body.vote)
                .then(() => {
                  return setCaching(res, false, false)
                    .send({ success: true });
                })
                .catch(next);
            })
            .catch(next);
        })
        .catch(next);
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
                .then((rawAITags) => {
                  db.getSkinTagVotes(skin.id)
                    .then((tagVotes) => {
                      db.getSkinSeenOn(skin.id)
                        .then((seenOn) => {
                          const aiTags = [];

                          // Are votes present for tags the AI maintains? Move them.
                          for (const aiTag of rawAITags) {
                            let sum = 0;

                            for (let i = 0; i < tagVotes.length; i++) {
                              const tagVote = tagVotes[i];

                              if (aiTag.id == tagVote.id) {
                                sum = tagVote.sum;
                                delete tagVotes[i];
                                break;
                              }
                            }

                            aiTags.push({
                              id: aiTag.id,
                              name: aiTag.name,
                              sum
                            });
                          }

                          const result: SkinDBSkin = {
                            skin,
                            tags,
                            aiTags,
                            tagVotes: tagVotes.filter((value) => value != undefined), // cleanup array
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
        })
        .catch(next);
    }
  });
});

router.all('/skins', (req, res, next) => {
  restful(req, res, {
    get: () => {
      if (!db.isAvailable()) return next(new ErrorBuilder().serviceUnavailable('SkinDB-Frontend route can only work while using a database'));
      if (req.query.page && !isNumber(req.query.page as string)) return next(new ErrorBuilder().invalidParams('query', [{ param: 'page', condition: 'Valid number > 0' }]));

      const page = typeof req.query.page == 'string' ? parseInt(req.query.page) : 1;

      if (page < 1) return next(new ErrorBuilder().invalidParams('query', [{ param: 'page', condition: 'Valid number > 0' }]));

      db.getNewestSkins(12, page * 12, true)
        .then((skins) => {
          const result: SkinDBSkins = {
            skins: skins.skins,
            page,
            hasNextPage: skins.moreAvailable
          }

          setCaching(res, true, false, 60, 60)
            .send(result);
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