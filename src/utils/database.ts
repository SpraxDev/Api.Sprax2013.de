import { Pool, PoolClient } from 'pg';

import { ApiError } from './utils';  // TODO: Don't use ./utils.ts because of ./index-debug.ts
import { SpraxAPIdbCfg, UserAgent, Skin, MinecraftUser, Cape, CapeType, MinecraftProfile } from '../global';

export class dbUtils {
  private pool: Pool | null = null;

  constructor(dbCfg: SpraxAPIdbCfg) {
    if (dbCfg.enabled) {
      this.pool = new Pool({
        host: dbCfg.host,
        port: dbCfg.port,
        user: dbCfg.user,
        password: dbCfg.password,
        database: dbCfg.databases.skindb,
        ssl: dbCfg.ssl ? { rejectUnauthorized: false } : false,
        max: dbCfg.connectionPoolSize
      });

      this.pool.on('error', (err, _client) => {
        console.error('Unexpected error on idle client:', err);
      });
    }
  }

  async updateUser(mcUser: MinecraftUser): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.pool == null) return reject(new Error('No database connected'));

      if (mcUser.nameHistory.length <= 0) return reject(new Error('nameHistory may not be an empty array'));

      this.pool.connect((err, client, done) => {
        if (err) return reject(err);

        client.query('BEGIN', (err) => {
          if (this.shouldAbortTransaction(client, done, err)) return reject(err);

          // Store latest profile
          client.query('INSERT INTO profiles(id,name_lower,raw_json,deleted) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO UPDATE SET name_lower =$2, raw_json =$3, last_update =CURRENT_TIMESTAMP;',
            [mcUser.id.toLowerCase(), mcUser.name.toLowerCase(), mcUser.toOriginal(), false], (err, _res) => {
              if (this.shouldAbortTransaction(client, done, err)) return reject(err);

              let queryStr = 'INSERT INTO name_history(profile_id,name,changed_to_at) VALUES';
              const queryArgs: (string | Date)[] = [mcUser.id];

              let counter = 2;
              for (const elem of mcUser.nameHistory) {
                if (counter > 2) queryStr += ', ';

                queryStr += `($1,$${counter++},${typeof elem.changedToAt == 'number' ? `$${counter++}` : `'-infinity'`})`;

                queryArgs.push(elem.name);

                if (typeof elem.changedToAt == 'number') {
                  queryArgs.push(new Date(elem.changedToAt));
                }
              }

              // Store Name-History
              client.query(`${queryStr} ON CONFLICT DO NOTHING;`, queryArgs, (err, _res) => {
                if (this.shouldAbortTransaction(client, done, err)) return reject(err);

                client.query('COMMIT', (err) => {
                  done();
                  if (err) return reject(err);

                  resolve();
                });
              });
            });
        });
      });
    });
  }

  async markUserDeleted(id: string, deleted: boolean = true): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.pool == null) return reject(new Error('No database connected'));

      this.pool.query('UPDATE profiles SET deleted =$2,last_update =CURRENT_TIMESTAMP WHERE id =$1;',
        [id.toLowerCase(), deleted], (err, _res) => {
          if (err) return reject(err);

          resolve();
        });
    });
  }

  getProfile(id: string, callback: (err: Error | null, profile: MinecraftProfile | null) => void): void {
    if (this.pool == null) return callback(null, null);

    this.pool.query(`SELECT raw_json FROM "profiles" WHERE id =$1 AND raw_json IS NOT NULL AND last_update >= NOW() - INTERVAL '120 seconds';`, [id], (err, res) => {
      if (err) return callback(err, null);

      callback(null, res.rows.length > 0 ? res.rows[0].raw_json : null);
    });
  }

  async searchProfile(name: string, mode: 'equal' | 'start' | 'end' | 'contains' = 'start', limit: number | 'ALL' = 12, offset: number = 0): Promise<MinecraftProfile[]> {
    return new Promise((resolve, reject) => {
      if (this.pool == null) return reject(new Error('No database connected'));
      if (!name) return reject(new Error('name may not be empty'));

      name = name.toLowerCase();

      const query = 'SELECT raw_json FROM profiles WHERE name_lower ' + (mode == 'equal' ? '=' : 'LIKE ') + '$1 ORDER BY name_lower LIMIT $2 OFFSET $3;',
        queryArgs = [mode == 'equal' ? name : (mode == 'start' ? name + '%' : (mode == 'end' ? '%' + name : '%' + name + '%')), limit, offset];

      this.pool.query(query, queryArgs)
        .then((res) => {
          let result: MinecraftProfile[] = [];

          for (const row of res.rows) {
            result.push(row.raw_json);
          }

          resolve(result);
        })
        .catch(reject);
    });
  }

  getUserAgent(name: string, internal: boolean, callback: (err: Error | null, userAgent: UserAgent | null) => void): void {
    if (this.pool == null) return callback(null, null);

    this.pool.connect((err, client, done) => {
      if (err) return callback(err, null);

      client.query('BEGIN', (err) => {
        if (this.shouldAbortTransaction(client, done, err)) return callback(err, null);

        client.query(`SELECT * FROM user_agents WHERE name =$1 AND internal =$2;`, [name, internal], (err, res) => {
          if (this.shouldAbortTransaction(client, done, err)) return callback(err, null);

          if (res.rows.length > 0) {
            client.query('COMMIT', (err) => {
              done();
              if (err) return callback(err, null);

              callback(null, RowUtils.toUserAgent(res.rows[0]));
            });
          } else {
            client.query(`INSERT INTO user_agents(name,internal) VALUES($1,$2) RETURNING *;`,
              [name, internal], (err, res) => {
                if (this.shouldAbortTransaction(client, done, err)) return callback(err, null);

                client.query('COMMIT', (err) => {
                  done();
                  if (err) return callback(err, null);

                  callback(null, RowUtils.toUserAgent(res.rows[0]));
                });
              });
          }
        });
      });
    });
  }

  async getSkinByURL(url: string): Promise<Skin> {
    return new Promise((resolve, reject) => {
      if (this.pool == null) return reject(new Error('No database connected'));

      this.pool.query('SELECT * FROM skins WHERE original_url =$1;',
        [url], (err, res) => {
          if (err) return reject(err);

          resolve(res.rows.length > 0 ? res.rows[0] : null);
        });
    });
    //
  }

  addSkin(originalPng: Buffer, cleanPng: Buffer, cleanPngHash: string, originalURL: string | null, textureValue: string | null,
    textureSignature: string | null, userAgent: UserAgent, callback: (err: Error | null, skin: Skin | null, exactMatch: boolean) => void): void {
    if (this.pool == null) return callback(null, null, false);
    if (originalURL && !originalURL.toLowerCase().startsWith('https://textures.minecraft.net/texture/')) return callback(new Error(`The provided originalURL(=${originalURL}) does not start with 'https://textures.minecraft.net/texture/'`), null, false);
    if (!textureValue && textureSignature) return callback(new Error('Only provide textureSignature with its textureValue!'), null, false);

    this.pool.connect((err, client, done) => {
      if (err) return callback(err, null, false);

      client.query('BEGIN', (err) => {
        if (this.shouldAbortTransaction(client, done, err)) return callback(err, null, false);

        client.query('LOCK TABLE skins IN EXCLUSIVE MODE;', (err) => {
          if (this.shouldAbortTransaction(client, done, err)) return callback(err, null, false);

          // only on file-upload original_url should be missing, so check clean_hash in these cases
          // We don't need an (clean) identical version with and without url
          const fieldName: string = originalURL ? 'original_url' : 'clean_hash',
            args = originalURL ? [originalURL] : [cleanPngHash];

          client.query(`SELECT * FROM skins WHERE ${fieldName} =$1 LIMIT 1;`, args, async (err, res) => {
            if (this.shouldAbortTransaction(client, done, err)) return callback(err, null, false);

            if (res.rows.length > 0) { // Exact same Skin-URL already in db
              let commit = false;
              if ((textureValue && !res.rows[0].texture_value) ||
                (textureValue && textureSignature && !res.rows[0].texture_signature)) {
                let err;
                try {
                  res = await client.query('UPDATE skins SET texture_value =$1,texture_signature =$2 WHERE id =$3 RETURNING *;', [textureValue, textureSignature, res.rows[0].id]);
                  commit = true;
                } catch (ex) {
                  err = ex;
                }

                if (this.shouldAbortTransaction(client, done, err)) return callback(err, null, false);
              }

              client.query(commit ? 'COMMIT' : 'ROLLBACK', (err) => {
                done();
                if (err) return callback(err, null, false);

                callback(null, RowUtils.toSkin(res.rows[0]), true);
              });
            } else {
              client.query(`SELECT * FROM skins WHERE clean_hash =$1 AND duplicate_of IS NULL LIMIT 1;`, [cleanPngHash], (err, res) => {
                if (this.shouldAbortTransaction(client, done, err)) return callback(err, null, false);

                const duplicateID: number | null = res.rows.length > 0 ? res.rows[0].id : null,
                  isDuplicate = res.rows.length > 0;

                client.query(`INSERT INTO skins(duplicate_of,original_url,texture_value,texture_signature,clean_hash,added_by)VALUES($1,$2,$3,$4,$5,$6) RETURNING *;`,
                  [duplicateID, originalURL, textureValue, textureSignature, (isDuplicate ? null : cleanPngHash), userAgent.id], (err, res) => {
                    if (this.shouldAbortTransaction(client, done, err)) return callback(err, null, false);

                    const resultSkin: Skin = RowUtils.toSkin(res.rows[0]);

                    if (!isDuplicate) {
                      client.query(`INSERT INTO skin_images(skin_id,original,clean)VALUES($1,$2,$3);`,
                        [resultSkin.id, originalPng, cleanPng], (err, _res) => {
                          if (this.shouldAbortTransaction(client, done, err)) return callback(err, null, false);

                          client.query('COMMIT', (err) => {
                            done();
                            if (err) return callback(err, null, false);

                            callback(null, resultSkin, false);
                          });
                        });
                    } else {
                      client.query('COMMIT', (err) => {
                        done();
                        if (err) return callback(err, null, false);

                        callback(null, resultSkin, false);
                      });
                    }
                  });
              });
            }
          });
        });
      });
    });
  }

  async addSkinToUserHistory(mcUser: MinecraftUser, skin: Skin, timestamp: Date | 'now'): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.pool == null) return reject(new Error('No database connected'));

      this.pool.connect((err, client, done) => {
        if (err) return reject(err);

        client.query('BEGIN', (err) => {
          if (this.shouldAbortTransaction(client, done, err)) return reject(err);

          client.query('LOCK TABLE skin_history IN ACCESS EXCLUSIVE MODE;', (err) => {
            if (this.shouldAbortTransaction(client, done, err)) return reject(err);

            client.query(`SELECT EXISTS(SELECT * FROM(SELECT sh.* FROM skin_history sh JOIN skins s ON sh.skin_id =s.id WHERE profile_id =$1 AND sh.added <= ${timestamp == 'now' ? 'CURRENT_TIMESTAMP' : '$3'} ORDER BY sh.added DESC LIMIT 1)x WHERE x.skin_id =$2) as before, EXISTS(SELECT * FROM(SELECT sh.* FROM skin_history sh JOIN skins s ON sh.skin_id =s.id WHERE profile_id =$1 AND sh.added > ${timestamp == 'now' ? 'CURRENT_TIMESTAMP' : '$3'} ORDER BY sh.added DESC LIMIT 1)x WHERE x.skin_id =$2) as after;`,
              [mcUser.id, skin.duplicateOf || skin.id, timestamp != 'now' ? timestamp : undefined], (err, res) => {
                if (this.shouldAbortTransaction(client, done, err)) return reject(err);

                if (res.rows[0].before || res.rows[0].after) { // Skin hasn't changed
                  client.query('ROLLBACK', (err) => {
                    done();
                    if (err) return reject(err);

                    resolve();
                  });
                } else {
                  client.query(`INSERT INTO skin_history(profile_id,skin_id,added) VALUES($1,$2,${timestamp == 'now' ? 'CURRENT_TIMESTAMP' : '$3'}) ON CONFLICT DO NOTHING;`,
                    [mcUser.id, skin.duplicateOf || skin.id, timestamp != 'now' ? timestamp : undefined], (err, _res) => {
                      if (this.shouldAbortTransaction(client, done, err)) return reject(err);

                      client.query('COMMIT', (err) => {
                        done();
                        if (err) return reject(err);

                        resolve();
                      });
                    });
                }
              });
          });
        });
      });
    });
  }

  async getSkinHistory(uuid: string, amount: number, offset: number): Promise<number[]> {
    return new Promise((resolve, reject) => {
      if (this.pool == null) return reject(new Error('No database connected'));

      this.pool.query(`SELECT skin_id FROM skin_history WHERE profile_id =$1 ORDER BY added DESC LIMIT $2 OFFSET $3;`, [uuid, amount, offset], (err, res) => {
        if (err) return reject(err);

        const skinIDs = [];

        for (const row of res.rows) {
          skinIDs.push(row.skin_id);
        }

        resolve(skinIDs);
      });
    });
  }

  async getSkinHistorySize(uuid: string): Promise<number> {
    return new Promise((resolve, reject) => {
      if (this.pool == null) return reject(new Error('No database connected'));

      this.pool.query(`SELECT COUNT(*) as count FROM skin_history WHERE profile_id =$1;`, [uuid], (err, res) => {
        if (err) return reject(err);

        resolve(res.rows.length == 0 ? 0 : res.rows[0].count);
      });
    });
  }

  addCape(capePng: Buffer, pngHash: string, type: CapeType, originalURL: string, textureValue: string | null, textureSignature: string | null, userAgent: UserAgent, callback: (err: Error | null, cape: Cape | null) => void): void {
    if (this.pool == null) return callback(null, null);
    if (type != CapeType.MOJANG && (textureValue || textureSignature)) return callback(new Error('Only provide textureValue and -Signature for Mojang-Capes!'), null);
    if (!textureValue && textureSignature) return callback(new Error('Only provide textureSignature with its textureValue!'), null);

    this.pool.connect((err, client, done) => {
      if (err) return callback(err, null);

      client.query('BEGIN', (err) => {
        if (this.shouldAbortTransaction(client, done, err)) return callback(err, null);

        client.query('LOCK TABLE capes IN EXCLUSIVE MODE;', (err) => {
          if (this.shouldAbortTransaction(client, done, err)) return callback(err, null);

          client.query(`SELECT * FROM capes WHERE clean_hash =$1 AND type =$2 LIMIT 1;`, [pngHash, type], (err, res) => {
            if (this.shouldAbortTransaction(client, done, err)) return callback(err, null);

            if (res.rows.length > 0) { // Exact same Cape-URL already in db
              client.query('COMMIT', (err) => {
                done();
                if (err) return callback(err, null);

                callback(null, RowUtils.toCape(res.rows[0]));
              });
            } else {
              client.query(`SELECT * FROM capes WHERE clean_hash =$1 AND duplicate_of IS NULL LIMIT 1;`, [pngHash], (err, res) => {
                if (this.shouldAbortTransaction(client, done, err)) return callback(err, null);

                const duplicateID: number | null = res.rows.length > 0 ? res.rows[0].id : null,
                  isDuplicate = res.rows.length > 0;

                client.query(`INSERT INTO capes(type,duplicate_of,original_url,added_by,clean_hash,texture_value,texture_signature)VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *;`,
                  [type, duplicateID, originalURL, userAgent.id, (isDuplicate ? null : pngHash), textureValue, textureSignature], (err, res) => {
                    if (this.shouldAbortTransaction(client, done, err)) return callback(err, null);

                    const resultCape: Cape = RowUtils.toCape(res.rows[0]);

                    if (!isDuplicate) {
                      client.query(`INSERT INTO cape_images(cape_id,original)VALUES($1,$2);`,
                        [resultCape.id, capePng], (err, _res) => {
                          if (this.shouldAbortTransaction(client, done, err)) return callback(err, null);

                          client.query('COMMIT', (err) => {
                            done();
                            if (err) return callback(err, null);

                            callback(null, resultCape);
                          });
                        });
                    } else {
                      client.query('COMMIT', (err) => {
                        done();
                        if (err) return callback(err, null);

                        callback(null, resultCape);
                      });
                    }
                  });
              });
            }
          });
        });
      });
    });
  }

  async addCapeToUserHistory(mcUser: MinecraftUser, cape: Cape, timestamp: Date | 'now'): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.pool == null) return reject(new Error('No database connected'));

      this.pool.connect((err, client, done) => {
        if (err) return reject(err);

        client.query('BEGIN', (err) => {
          if (this.shouldAbortTransaction(client, done, err)) return reject(err);

          client.query('LOCK TABLE cape_history IN ACCESS EXCLUSIVE MODE;', (err) => {
            if (this.shouldAbortTransaction(client, done, err)) return reject(err);

            client.query(`SELECT EXISTS(SELECT * FROM(SELECT ch.* FROM cape_history ch JOIN capes c ON ch.cape_id =c.id WHERE profile_id =$1 AND c.type =$2 AND ch.added <= ${timestamp != 'now' ? '$4' : 'CURRENT_TIMESTAMP'} ORDER BY ch.added DESC LIMIT 1)x WHERE x.cape_id =$3) as before, EXISTS(SELECT * FROM(SELECT ch.* FROM cape_history ch JOIN capes c ON ch.cape_id =c.id WHERE profile_id =$1 AND c.type =$2 AND ch.added > ${timestamp != 'now' ? '$4' : 'CURRENT_TIMESTAMP'} ORDER BY ch.added DESC LIMIT 1)x WHERE x.cape_id =$3) as after;`,
              [mcUser.id, cape.type, cape.duplicateOf || cape.id, timestamp != 'now' ? timestamp : undefined], (err, res) => {
                if (this.shouldAbortTransaction(client, done, err)) return reject(err);

                if (res.rows[0].before || res.rows[0].after) { // Cape hasn't changed
                  client.query('ROLLBACK', (err) => {
                    done();
                    if (err) return reject(err);

                    resolve();
                  });
                } else {
                  client.query(`INSERT INTO cape_history(profile_id,cape_id,added) VALUES($1,$2,${timestamp != 'now' ? '$3' : 'CURRENT_TIMESTAMP'}) ON CONFLICT DO NOTHING;`,
                    [mcUser.id, cape.duplicateOf || cape.id, timestamp != 'now' ? timestamp : undefined], (err, _res) => {
                      if (this.shouldAbortTransaction(client, done, err)) return reject(err);

                      client.query('COMMIT', (err) => {
                        done();
                        if (err) return reject(err);

                        resolve();
                      });
                    });
                }
              });
          });
        });
      });
    });
  }

  async getSkin(skinID: string): Promise<Skin | null> {
    return new Promise((resolve, reject) => {
      if (this.pool == null) return reject(new Error('No database connected'));

      this.pool.query(`SELECT * FROM skins WHERE id =$1;`, [skinID], (err, res) => {
        if (err) return reject(err);

        resolve(res.rows.length == 0 ? null : RowUtils.toSkin(res.rows[0]));
      });
    });
  }

  async getSkins(tags: string[], limit: number | 'ALL' = 6, offset: number = 0): Promise<{ skins: Skin[], moreAvailable: boolean }> {
    return new Promise((resolve, reject) => {
      if (this.pool == null) return reject(new Error('No database connected'));
      if (tags.length == 0) return resolve({ skins: [], moreAvailable: false });

      // alter Codeteil der jetzt fehlt: SELECT skins.*,COUNT(*) OVER() AS total FROM
      const queryStart = 'SELECT skins.* FROM (WITH tagIDs AS (SELECT id FROM tags WHERE ',
        queryEnd = ') SELECT skin_id,tag_id FROM skin_tags WHERE tag_id IN (SELECT * FROM tagIDs) UNION ' +
          'SELECT skin_id,tag_id FROM tag_votes_ai WHERE tag_id IN (SELECT * FROM tagIDs)) ' +
          `as outerT JOIN skins ON skins.id = outerT.skin_id LIMIT $${tags.length + 1} OFFSET $${tags.length + 2};`;

      let queryTagFilter = '';

      for (let i = 0; i < tags.length; i++) {
        if (i != 0) {
          queryTagFilter += ' OR ';
        }

        queryTagFilter += `lower(name) =lower($${i + 1})`;
      }

      this.pool.query(queryStart + queryTagFilter + queryEnd, [...tags, typeof limit == 'number' ? limit + 1 : limit, offset], (err, res) => {
        if (err) return reject(err);

        const result = [];

        for (const row of res.rows) {
          result.push(RowUtils.toSkin(row));
        }

        let moreAvailable = limit == 'ALL';
        if (!moreAvailable && result.length > limit) {
          result.pop();
          moreAvailable = true;
        }

        resolve({ skins: result, moreAvailable });
      });
    });
  }

  async getSkinTags(skinID: string): Promise<{ id: string, name: string }[]> {
    return new Promise((resolve, reject) => {
      if (this.pool == null) return reject(new Error('No database connected'));

      this.pool.query('SELECT tag_id,name FROM skin_tags JOIN tags ON skin_tags.tag_id =tags.id WHERE skin_id =$1;', [skinID], (err, res) => {
        if (err) return reject(err);

        const tags = [];
        for (const row of res.rows) {
          tags.push({
            id: row.tag_id,
            name: row.name
          });
        }

        resolve(tags);
      });
    });
  }

  async getSkinAiTags(skinID: string): Promise<{ id: string, name: string }[]> {
    return new Promise((resolve, reject) => {
      if (this.pool == null) return reject(new Error('No database connected'));

      this.pool.query('SELECT tag_id,name FROM tag_votes_ai JOIN tags ON tag_votes_ai.tag_id =tags.id WHERE skin_id =$1 AND vote =true;', [skinID], (err, res) => {
        if (err) return reject(err);

        const tags = [];
        for (const row of res.rows) {
          tags.push({
            id: row.tag_id,
            name: row.name
          });
        }

        resolve(tags);
      });
    });
  }

  // TODO: Make sure that not too many are returned at once using LIMIT and OFFSET
  async getSkinSeenOn(skinID: string): Promise<{ name: string, id: string }[]> {
    return new Promise((resolve, reject) => {
      if (this.pool == null) return reject(new Error('No database connected'));

      this.pool.query('SELECT * FROM(SELECT DISTINCT ON(id) profiles.raw_json->>\'name\' as name, profiles.id,(SELECT EXISTS(SELECT * FROM (SELECT * FROM skin_history as inner_skin_history WHERE inner_skin_history.profile_id =id ORDER BY added DESC LIMIT 1)x WHERE skin_id =$1)) as exists FROM skin_history JOIN profiles ON id =profile_id WHERE skin_id =$1)x2 ORDER BY name,exists DESC LIMIT 600;', [skinID], (err, res) => {
        if (err) return reject(err);

        let result = [];
        for (const row of res.rows) {
          result.push({
            name: row.name,
            id: row.id
          });
        }

        resolve(result);
      });
    });
  }

  async getMostUsedSkinsLast7Days(): Promise<{ id: string, count: number }[]> {
    return new Promise((resolve, reject) => {
      if (this.pool == null) return reject(new Error('No database connected'));

      this.pool.query('SELECT skin_id, COUNT(*) as count FROM skin_history JOIN skins ON skin_history.skin_id = skins.id WHERE duplicate_of IS NULL AND skins.added >= CURRENT_TIMESTAMP - interval \'7 DAYS\' GROUP BY skin_id ORDER BY count DESC LIMIT 10;', [], (err, res) => {
        if (err) return reject(err);

        let result = [];
        for (const row of res.rows) {
          result.push({
            id: row.skin_id,
            count: row.count
          });
        }

        resolve(result);
      });
    });
  }

  getSkinImage(skinID: string, type: 'clean' | 'original', callback: (err: Error | null, img: Buffer | null) => void): void {
    if (this.pool == null) return callback(null, null);

    this.pool.query(`SELECT ${type == 'original' ? 'original' : 'clean'} as img FROM skin_images WHERE skin_id =$1;`, [skinID], (err, res) => {
      if (err) return callback(err, null);

      callback(null, res.rows.length > 0 ? res.rows[0].img : null);
    });
  }

  getCape(capeID: string, callback: (err: Error | null, cape: Cape | null) => void): void {
    if (this.pool == null) return callback(null, null);

    this.pool.query(`SELECT * FROM capes WHERE id =$1;`, [capeID], (err, res) => {
      if (err) return callback(err, null);

      callback(null, res.rows.length == 0 ? null : RowUtils.toCape(res.rows[0]));
    });
  }

  getCapeImage(skinID: string, callback: (err: Error | null, img: Buffer | null) => void): void {
    if (this.pool == null) return callback(null, null);

    this.pool.query(`SELECT original FROM cape_images WHERE cape_id =$1;`, [skinID], (err, res) => {
      if (err) return callback(err, null);

      callback(null, res.rows.length > 0 ? res.rows[0].original : null);
    });
  }

  addHost(host: string, sha1: string, callback: (err: Error | null) => void): void {
    if (this.pool == null) return callback(null);

    this.pool.query('INSERT INTO hosts(host,hash) VALUES($1,$2) ON CONFLICT DO NOTHING;', [host, sha1], (err, _res) => {
      return callback(err || null);
    });
  }

  getHost(sha1: string, callback: (err: Error | null, host: string | null) => void): void {
    if (this.pool == null) return callback(null, null);

    this.pool.query('SELECT host FROM hosts WHERE hash =$1;', [sha1], (err, res) => {
      return callback(err || null, res.rows.length > 0 ? res.rows[0].host : null);
    });
  }

  /* Helper */

  isAvailable(): boolean {
    return this.pool != null;
  }

  isReady(callback: (err: Error | null) => void): void {
    if (this.pool == null) return callback(null);

    this.pool.query('SELECT NOW();', (err, _res) => callback(err));
  }

  /**
   * This function should only be used for debugging purpose!
   */
  getPool(): Pool | null {
    return this.pool;
  }

  shutdown(): Promise<void> {
    if (this.pool == null) return new Promise((resolve, _reject) => { resolve(); });

    const result = this.pool.end();
    this.pool = null;

    return result;
  }

  private shouldAbortTransaction(client: PoolClient, done: (release?: any) => void, err: Error): boolean {
    if (err) {
      client.query('ROLLBACK', (err) => {
        done();
        if (err) return ApiError.log('Error rolling back client', err);
      });
    }

    return !!err;
  }
}

class RowUtils {
  static toSkin(row: any): Skin {
    return {
      id: row.id,
      duplicateOf: row.duplicate_of,
      originalURL: row.original_url,
      textureValue: row.texture_value,
      textureSignature: row.texture_signature,
      added: row.added,
      addedBy: row.added_by,
      cleanHash: row.clean_hash
    };
  }

  static toCape(row: any): Cape {
    return {
      id: row.id,
      type: row.type as CapeType,
      duplicateOf: row.duplicate_of,
      originalURL: row.original_url,
      addedBy: row.added_by,
      added: row.added,
      cleanHash: row.clean_hash,
      textureValue: row.texture_value,
      textureSignature: row.texture_signature
    };
  }

  static toUserAgent(row: any): UserAgent {
    return {
      id: row.id,
      name: row.name,
      internal: row.internal
    };
  }
}