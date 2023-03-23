import { Pool, PoolClient } from 'pg';

import {
  Cape,
  CapeType,
  MinecraftNameHistoryElement,
  MinecraftProfile,
  MinecraftUser,
  Skin,
  SpraxAPIdbCfg,
  UserAgent
} from '../global';
import { ApiError } from './utils'; // TODO: don't import from utils because of index-debug.ts

export class dbUtils {
  private pool: Pool | null = null;
  private connectedClients: number = 0;

  constructor(dbCfg: SpraxAPIdbCfg) {
    if (dbCfg.enabled) {
      this.pool = new Pool({
        host: dbCfg.host,
        port: dbCfg.port,
        user: dbCfg.user,
        password: dbCfg.password,
        database: dbCfg.databases.skindb,
        ssl: dbCfg.ssl ? {rejectUnauthorized: false} : false,
        max: dbCfg.connectionPoolSize,

        idleTimeoutMillis: 10 * 60 * 1000
      });

      this.pool.on('connect', (_client) => {
        if (this.connectedClients == 0) {
          console.log('[+] Connected to PostgreSQL database');
        }

        this.connectedClients++;
      });
      this.pool.on('remove', (_client) => {
        if (this.connectedClients == 1) {
          console.log('[-] Disconnected from PostgreSQL database');
        }

        this.connectedClients--;
      });
      this.pool.on('error', (err, _client) => {
        console.error('Unexpected error on idle client:', err);
      });
    }
  }

  /* Profiles */
  async updateProfile(mcProfile: MinecraftProfile): Promise<void> {
    return new Promise(async (resolve, reject): Promise<void> => {
      if (this.pool == null) return reject(new Error('No database connected'));

      let client: PoolClient | undefined;

      try {
        // Store latest profile
        await (client ?? this.pool).query('INSERT INTO profiles(id,name_lower,raw_json,deleted) VALUES(lower($1),lower($2),$3,$4) ' +
            'ON CONFLICT(id) DO UPDATE SET name_lower =lower($2), raw_json =$3, last_update =CURRENT_TIMESTAMP;',
            [mcProfile.id, mcProfile.name, mcProfile, false]);

        await client?.query('COMMIT');
        client?.release();

        resolve();
      } catch (err) {
        client?.query('ROLLBACK', (err) => {
          client?.release();

          if (err) {
            ApiError.log('Error rolling back client', err);
          }
        });

        reject(err);
      }
    });
  }

  async markUserDeleted(id: string, deleted: boolean = true): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.pool == null) return reject(new Error('No database connected'));

      this.pool.query('UPDATE profiles SET deleted =$2,last_update =CURRENT_TIMESTAMP WHERE id =lower($1);',
          [id, deleted], (err, _res) => {
            if (err) return reject(err);

            resolve();
          });
    });
  }

  async getProfileByName(username: string): Promise<MinecraftProfile | null> {
    return new Promise((resolve, reject) => {
      if (this.pool == null) return reject(new Error('No database connected'));

      this.pool.query(`SELECT raw_json FROM "profiles" WHERE name_lower =lower($1) AND raw_json IS NOT NULL;`,
          [username], (err, res) => {
            if (err) return reject(err);

            resolve(res.rows.length > 0 ? res.rows[0].raw_json : null);
          });
    });
  }

  async getProfile(id: string, onlyRecent: boolean = false): Promise<MinecraftProfile | null> {
    return new Promise((resolve, reject) => {
      if (this.pool == null) return reject(new Error('No database connected'));

      this.pool.query(`SELECT raw_json FROM "profiles" WHERE id =$1 AND raw_json IS NOT NULL ${onlyRecent ? `AND last_update >= NOW() - INTERVAL '60 seconds'` : ''};`,
          [id], (err, res) => {
            if (err) return reject(err);

            resolve(res.rows.length > 0 ? res.rows[0].raw_json : null);
          });
    });
  }

  /* UserAgent */

  async getUserAgent(name: string, internal: boolean): Promise<UserAgent> {
    return new Promise((resolve, reject) => {
      if (this.pool == null) return reject(new Error('No database connected'));

      this.pool.connect((err, client, done) => {
        if (err) return reject(err);

        client.query('BEGIN', (err) => {
          if (this.shouldAbortTransaction(client, done, err)) return reject(err);

          client.query(`SELECT * FROM user_agents WHERE name =$1 AND internal =$2;`, [name, internal], (err, res) => {
            if (this.shouldAbortTransaction(client, done, err)) return reject(err);

            if (res.rows.length > 0) {
              client.query('COMMIT', (err) => {
                done();
                if (err) return reject(err);

                resolve(RowUtils.toUserAgent(res.rows[0]));
              });
            } else {
              client.query(`INSERT INTO user_agents(name,internal) VALUES($1,$2) RETURNING *;`,
                  [name, internal], (err, res) => {
                    if (this.shouldAbortTransaction(client, done, err)) return reject(err);

                    client.query('COMMIT', (err) => {
                      done();
                      if (err) return reject(err);

                      resolve(RowUtils.toUserAgent(res.rows[0]));
                    });
                  });
            }
          });
        });
      });
    });
  }

  /* Skins */

  async addSkin(originalPng: Buffer, cleanPng: Buffer, cleanPngHash: string, originalURL: string | null, textureValue: string | null,
                textureSignature: string | null, userAgent: UserAgent): Promise<{ skin: Skin, exactMatch: boolean }> {
    return new Promise((resolve, reject) => {
      if (this.pool == null) return reject(new Error('No database connected'));

      if (originalURL &&
          !originalURL.toLowerCase().startsWith('https://textures.minecraft.net/texture/')) return reject(new Error(`The provided originalURL(=${originalURL}) does not start with 'https://textures.minecraft.net/texture/'`));
      if (!textureValue && textureSignature) return reject(new Error('Only provide textureSignature with its textureValue!'));

      this.pool.connect((err, client, done) => {
        if (err) return reject(err);

        client.query('BEGIN', (err) => {
          if (this.shouldAbortTransaction(client, done, err)) return reject(err);

          client.query('LOCK TABLE skins IN EXCLUSIVE MODE;', (err) => {
            if (this.shouldAbortTransaction(client, done, err)) return reject(err);

            // only on file-upload original_url should be missing, so check clean_hash in these cases
            // We don't need an (clean) identical version with and without url
            const fieldName: string = originalURL ? 'original_url' : 'clean_hash',
                args = originalURL ? [originalURL] : [cleanPngHash];

            client.query(`SELECT * FROM skins WHERE ${fieldName} =$1 LIMIT 1;`, args, async (err, res) => {
              if (this.shouldAbortTransaction(client, done, err)) return reject(err);

              if (res.rows.length > 0) { // Exact same Skin-URL already in db
                let commit = false;
                if ((textureValue && !res.rows[0].texture_value) ||
                    (textureValue && textureSignature && !res.rows[0].texture_signature)) {
                  let err;
                  try {
                    res = await client.query('UPDATE skins SET texture_value =$1,texture_signature =$2 WHERE id =$3 RETURNING *;',
                        [textureValue, textureSignature, res.rows[0].id]);
                    commit = true;
                  } catch (ex) {
                    err = ex;
                  }

                  if (this.shouldAbortTransaction(client, done, err)) return reject(err);
                }

                client.query(commit ? 'COMMIT' : 'ROLLBACK', (err) => {
                  done();
                  if (err) return reject(err);

                  resolve({
                    skin: RowUtils.toSkin(res.rows[0]),
                    exactMatch: true
                  });
                });
              } else {
                client.query(`SELECT * FROM skins WHERE clean_hash =$1 AND duplicate_of IS NULL LIMIT 1;`, [cleanPngHash], (err, res) => {
                  if (this.shouldAbortTransaction(client, done, err)) return reject(err);

                  const duplicateID: number | null = res.rows.length > 0 ? res.rows[0].id : null,
                      isDuplicate = res.rows.length > 0;

                  client.query(`INSERT INTO skins(duplicate_of,original_url,texture_value,texture_signature,clean_hash,added_by)VALUES($1,$2,$3,$4,$5,$6) RETURNING *;`,
                      [duplicateID, originalURL, textureValue, textureSignature, (isDuplicate ? null : cleanPngHash), userAgent.id], (err, res) => {
                        if (this.shouldAbortTransaction(client, done, err)) return reject(err);

                        const resultSkin: Skin = RowUtils.toSkin(res.rows[0]);

                        if (!isDuplicate) {
                          client.query(`INSERT INTO skin_images(skin_id,original,clean)VALUES($1,$2,$3);`,
                              [resultSkin.id, originalPng, cleanPng], (err, _res) => {
                                if (this.shouldAbortTransaction(client, done, err)) return reject(err);

                                client.query('COMMIT', (err) => {
                                  done();
                                  if (err) return reject(err);

                                  resolve({
                                    skin: resultSkin,
                                    exactMatch: false
                                  });
                                });
                              });
                        } else {
                          client.query('COMMIT', (err) => {
                            done();
                            if (err) return reject(err);

                            resolve({
                              skin: resultSkin,
                              exactMatch: false
                            });
                          });
                        }
                      });
                });
              }
            });
          });
        });
      });
    });
  }

  async addSkinToUserHistory(uuid: string, skin: Skin, timestamp: Date | 'now'): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.pool == null) return reject(new Error('No database connected'));

      this.pool.connect((err, client, done) => {
        if (err) return reject(err);

        client.query('BEGIN', (err) => {
          if (this.shouldAbortTransaction(client, done, err)) return reject(err);

          client.query('LOCK TABLE skin_history IN ACCESS EXCLUSIVE MODE;', (err) => {
            if (this.shouldAbortTransaction(client, done, err)) return reject(err);

            client.query(`SELECT EXISTS(SELECT * FROM(SELECT sh.* FROM skin_history sh JOIN skins s ON sh.skin_id =s.id WHERE profile_id =$1 AND sh.added <= ${timestamp == 'now' ? 'CURRENT_TIMESTAMP' : '$3'} ORDER BY sh.added DESC LIMIT 1)x WHERE x.skin_id =$2) as before, EXISTS(SELECT * FROM(SELECT sh.* FROM skin_history sh JOIN skins s ON sh.skin_id =s.id WHERE profile_id =$1 AND sh.added > ${timestamp == 'now' ? 'CURRENT_TIMESTAMP' : '$3'} ORDER BY sh.added DESC LIMIT 1)x WHERE x.skin_id =$2) as after;`,
                [uuid, skin.duplicateOf || skin.id, timestamp != 'now' ? timestamp : undefined], (err, res) => {
                  if (this.shouldAbortTransaction(client, done, err)) return reject(err);

                  if (res.rows[0].before || res.rows[0].after) { // Skin hasn't changed
                    client.query('ROLLBACK', (err) => {
                      done();
                      if (err) return reject(err);

                      resolve();
                    });
                  } else {
                    client.query(`INSERT INTO skin_history(profile_id,skin_id,added) VALUES($1,$2,${timestamp == 'now' ? 'CURRENT_TIMESTAMP' : '$3'}) ON CONFLICT DO NOTHING;`,
                        [uuid, skin.duplicateOf || skin.id, timestamp != 'now' ? timestamp : undefined], (err, _res) => {
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

  /* Cape */

  async addCape(capePng: Buffer, pngHash: string, type: CapeType, originalURL: string,
                textureValue: string | null, textureSignature: string | null, userAgent: UserAgent): Promise<Cape> {
    return new Promise((resolve, reject) => {
      if (this.pool == null) return reject(new Error('No database connected'));
      if (type != CapeType.MOJANG && (textureValue || textureSignature)) return reject(new Error('Only provide textureValue and -Signature for Mojang-Capes!'));
      if (!textureValue && textureSignature) return reject(new Error('Only provide textureSignature with its textureValue!'));

      this.pool.connect((err, client, done) => {
        if (err) return reject(err);

        client.query('BEGIN', (err) => {
          if (this.shouldAbortTransaction(client, done, err)) return reject(err);

          client.query('LOCK TABLE capes IN EXCLUSIVE MODE;', (err) => {
            if (this.shouldAbortTransaction(client, done, err)) return reject(err);

            client.query(`SELECT * FROM capes WHERE clean_hash =$1 AND type =$2 LIMIT 1;`, [pngHash, type], (err, res) => {
              if (this.shouldAbortTransaction(client, done, err)) return reject(err);

              if (res.rows.length > 0) { // Exact same Cape-URL already in db
                client.query('COMMIT', (err) => {
                  done();
                  if (err) return reject(err);

                  resolve(RowUtils.toCape(res.rows[0]));
                });
              } else {
                client.query(`SELECT * FROM capes WHERE clean_hash =$1 AND duplicate_of IS NULL LIMIT 1;`, [pngHash], (err, res) => {
                  if (this.shouldAbortTransaction(client, done, err)) return reject(err);

                  const duplicateID: number | null = res.rows.length > 0 ? res.rows[0].id : null,
                      isDuplicate = res.rows.length > 0;

                  client.query(`INSERT INTO capes(type,duplicate_of,original_url,added_by,clean_hash,texture_value,texture_signature)VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *;`,
                      [type, duplicateID, originalURL, userAgent.id, (isDuplicate ? null : pngHash), textureValue, textureSignature], (err, res) => {
                        if (this.shouldAbortTransaction(client, done, err)) return reject(err);

                        const resultCape: Cape = RowUtils.toCape(res.rows[0]);

                        if (!isDuplicate) {
                          client.query(`INSERT INTO cape_images(cape_id,original)VALUES($1,$2);`,
                              [resultCape.id, capePng], (err, _res) => {
                                if (this.shouldAbortTransaction(client, done, err)) return reject(err);

                                client.query('COMMIT', (err) => {
                                  done();
                                  if (err) return reject(err);

                                  resolve(resultCape);
                                });
                              });
                        } else {
                          client.query('COMMIT', (err) => {
                            done();
                            if (err) return reject(err);

                            resolve(resultCape);
                          });
                        }
                      });
                });
              }
            });
          });
        });
      });
    });
  }

  async addCapeToUserHistory(id: string, cape: Cape, timestamp: Date | 'now'): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.pool == null) return reject(new Error('No database connected'));

      this.pool.connect((err, client, done) => {
        if (err) return reject(err);

        client.query('BEGIN', (err) => {
          if (this.shouldAbortTransaction(client, done, err)) return reject(err);

          client.query('LOCK TABLE cape_history IN ACCESS EXCLUSIVE MODE;', (err) => {
            if (this.shouldAbortTransaction(client, done, err)) return reject(err);

            client.query(`SELECT EXISTS(SELECT * FROM(SELECT ch.* FROM cape_history ch JOIN capes c ON ch.cape_id =c.id WHERE profile_id =$1 AND c.type =$2 AND ch.added <= ${timestamp != 'now' ? '$4' : 'CURRENT_TIMESTAMP'} ORDER BY ch.added DESC LIMIT 1)x WHERE x.cape_id =$3) as before, EXISTS(SELECT * FROM(SELECT ch.* FROM cape_history ch JOIN capes c ON ch.cape_id =c.id WHERE profile_id =$1 AND c.type =$2 AND ch.added > ${timestamp != 'now' ? '$4' : 'CURRENT_TIMESTAMP'} ORDER BY ch.added DESC LIMIT 1)x WHERE x.cape_id =$3) as after;`,
                [id.toLowerCase(), cape.type, cape.duplicateOf || cape.id, timestamp != 'now' ? timestamp : undefined], (err, res) => {
                  if (this.shouldAbortTransaction(client, done, err)) return reject(err);

                  if (res.rows[0].before || res.rows[0].after) { // Cape hasn't changed
                    client.query('ROLLBACK', (err) => {
                      done();
                      if (err) return reject(err);

                      resolve();
                    });
                  } else {
                    client.query(`INSERT INTO cape_history(profile_id,cape_id,added) VALUES($1,$2,${timestamp != 'now' ? '$3' : 'CURRENT_TIMESTAMP'}) ON CONFLICT DO NOTHING;`,
                        [id.toLowerCase(), cape.duplicateOf || cape.id, timestamp != 'now' ? timestamp : undefined], (err, _res) => {
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

  /* Hosts */

  async addHosts(hosts: { hash: string, host: string }[]): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.pool == null) return reject(new Error('No database connected'));
      if (hosts.length == 0) return resolve();

      let query = 'INSERT INTO hosts(host,hash) VALUES';
      const queryArgs = [];

      let argI = 0;
      for (let i = 0; i < hosts.length; i++) {
        const elem = hosts[i];

        if (i > 0) {
          query += ', ';
        }

        query += `($${++argI},$${++argI})`;
        queryArgs.push(elem.host);
        queryArgs.push(elem.hash);
      }
      query += ' ON CONFLICT DO NOTHING;';

      this.pool.query(query, queryArgs, (err, _res) => {
        if (err) return reject(err);

        resolve();
      });
    });
  }

  async getHost(sha1: string[] | string): Promise<{ hash: string, host: string }[]> {
    return new Promise((resolve, reject) => {
      if (this.pool == null) return resolve([]);
      if (!Array.isArray(sha1)) sha1 = [sha1];

      this.pool.query('SELECT host,hash FROM hosts WHERE hash = ANY($1) ORDER BY host;', [sha1], (err, res) => {
        if (err) return reject(err);

        const result: { hash: string, host: string }[] = [];

        for (const row of res.rows) {
          result.push({hash: row.hash, host: row.host});
        }

        resolve(result);
      });
    });
  }

  /* Helper */

  isAvailable(): boolean {
    return this.pool != null;
  }

  async isReady(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.pool == null) return reject();

      this.pool.query('SELECT NOW();')
          .then(() => resolve())
          .catch((err) => reject(err));
    });
  }

  /**
   * This function should only be used for debugging purpose!
   */
  getPool(): Pool | null {
    return this.pool;
  }

  async shutdown(): Promise<void> {
    if (this.pool == null) return new Promise((resolve, _reject) => {
      resolve();
    });

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