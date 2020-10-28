import { Router } from 'express';

import { db } from '..';
import { getByUsername, getByUUID, getUserAgent } from './minecraft';
import {
  ApiError,
  compareString,
  ErrorBuilder,
  generateHash,
  Image,
  isNumber,
  isUUID,
  restful,
  setCaching
} from '../utils/utils';
import { Skin, SkinDBAccount, SkinDBIndex, SkinDBSearch, SkinDBSkin, SkinDBSkins } from '../global';
import { importSkinByBuffer } from './skindb';

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
      if (typeof req.body.vote != 'boolean' && req.body.vote != 'unset') invalidBody.push({ param: 'vote', condition: `Boolean value or 'unset'` });
      if (invalidBody.length > 0) return next(new ErrorBuilder().invalidBody(invalidBody));

      db.getSkin(req.params.skinID)
        .then((skin) => {
          if (!skin) return next(new ErrorBuilder().notFound('skin for that id'));

          db.getTag(req.body.tag)
            .then((tag) => {
              if (!tag) return next(new ErrorBuilder().notFound('tag for that name'));

              const done = () => {
                return setCaching(res, false, false)
                  .send({ success: true });
              };

              if (req.body.vote == 'unset') {
                db.removeSkinVote(req.body.user, skin.id, tag.duplicateOf || tag.id)
                  .then(done)
                  .catch(next);
              } else {
                db.setSkinVote(req.body.user, skin.id, tag.duplicateOf || tag.id, req.body.vote)
                  .then(done)
                  .catch(next);
              }
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
      if (req.query.profile && !isUUID(req.query.profile as string)) return next(new ErrorBuilder().invalidParams('query', [{ param: 'profile', condition: 'Valid UUID v4' }]));

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
                        .then(async (seenOn): Promise<void> => {
                          let profileVotes = undefined;

                          if (req.query.profile) {
                            profileVotes = await db.getSkinVotes(skin.id, req.query.profile as string);
                          }

                          const aiTags = [];

                          // Are votes present for tags the AI maintains? Move them.
                          for (const aiTag of rawAITags) {
                            let sum = 0;

                            for (let i = 0; i < tagVotes.length; i++) {
                              const tagVote = tagVotes[i];

                              if (aiTag.id == tagVote.id) {
                                sum = tagVote.sum;
                                tagVotes.splice(i, 1);
                                break;
                              }
                            }

                            aiTags.push({
                              id: aiTag.id,
                              name: aiTag.name,
                              sum
                            });
                          }

                          tags.sort((a, b) => compareString(a.name, b.name));
                          aiTags.sort((a, b) => compareString(a.name, b.name));
                          tagVotes.sort((a, b) => a.sum - b.sum);

                          const result: SkinDBSkin = {
                            skin,
                            tags,
                            aiTags,
                            tagVotes,
                            seenOn,
                            profileVotes
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

      db.getSkinList(12, page * 12, true)
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

      const page = typeof req.query.page == 'string' ? parseInt(req.query.page) : 1;
      if (page < 1) return next(new ErrorBuilder().invalidParams('query', [{ param: 'page', condition: 'Valid number > 0' }]));

      let directProfileHit: SkinDBSearch['profiles']['direct'] = null,
        indirectProfileHits: SkinDBSearch['profiles']['indirect'] = [],
        skinHits: { skins: Skin[], time: number, moreAvailable: boolean } = { skins: [], time: 0, moreAvailable: false };

      let result: SkinDBSearch = {
        profiles: { direct: directProfileHit, indirect: indirectProfileHits },
        skins: { hits: skinHits.skins, page, time: skinHits.time, hasNextPage: skinHits.moreAvailable }
      };

      if (req.header('Content-Type') == 'image/png') {
        if (page != 1) return setCaching(res, true, false, 60, 60).send(result);

        Image.fromImg(req.body, (err, queryImg) => {
          if (err || !queryImg) return next(err || new ErrorBuilder().invalidBody([{ param: 'body', condition: 'Valid png (max. 3MB)' }]));
          if (!queryImg.hasSkinDimensions()) return next(new ErrorBuilder().invalidBody([{ param: 'body', condition: 'Valid skin file (wrong image dimensions)' }]));

          getUserAgent(null)
            .then((userAgent) => {
              importSkinByBuffer(req.body, null, userAgent, (err, skin) => {
                if (err || !skin) return next(err || new ErrorBuilder().unknown());

                queryImg.toCleanSkin((err) => {
                  if (err) return next(err);

                  queryImg.generateSkinAlternatives()
                    .then((variations) => {
                      const hashes = [generateHash(queryImg.img.data)];

                      for (const varImg of variations) {
                        hashes.push(generateHash(varImg.img.data));
                      }

                      db.getSkinsByHash(hashes)
                        .then((dbRes) => {
                          result = {
                            profiles: {
                              direct: directProfileHit,
                              indirect: indirectProfileHits
                            },
                            skins: {
                              hasNextPage: false,
                              hits: dbRes.skins,
                              page,
                              time: dbRes.time
                            }
                          }

                          setCaching(res, true, false, 60, 60)
                            .send(result);
                        })
                        .catch(next);
                    })
                    .catch(next);
                });
              }, undefined, undefined, true);
            })
            .catch(next);
        });
      } else {
        const query = req.query.q as string | undefined;

        if (!query) return next(new ErrorBuilder().invalidParams('query', [{ param: 'q', condition: 'Valid string' }]));
        if (req.query.page && !isNumber(req.query.page as string)) return next(new ErrorBuilder().invalidParams('query', [{ param: 'page', condition: 'Valid number > 0' }]));

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
          try {
            indirectProfileHits = (await db.searchProfile(query, 4, 0))
              .map((elem) => { return { name: elem.profile.name, matched_name: elem.matched_name, id: elem.profile.id }; })
              .filter((elem) => elem.id != directProfileHit?.id);

            if (indirectProfileHits.length == 4) {
              indirectProfileHits.pop();
            }
          } catch (err) {
            ApiError.log('Could not search for profiles (indirect)', { err, query });
          }
        }

        // Search for Tagged Skins
        try {
          skinHits = await db.searchSkins(query, 12, (page - 1) * 12);
        } catch (err) {
          ApiError.log('Could not search for skins', { err, query });
        }

        result = {
          profiles: {
            direct: directProfileHit,
            indirect: indirectProfileHits
          },
          skins: {
            hits: skinHits.skins,
            time: skinHits.time,
            page,
            hasNextPage: skinHits.moreAvailable
          }
        };

        setCaching(res, true, false, 60, 60)
          .send(result);
      }
    }
  });
});