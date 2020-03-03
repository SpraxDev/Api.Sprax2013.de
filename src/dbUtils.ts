import { Pool, PoolClient } from 'pg';

import { generateHash } from './utils';
import { SpraxAPIdbCfg, UserAgent, Skin, MinecraftUser, Cape, CapeType } from './global';

export class dbUtils {
  readonly pool: Pool;

  constructor(dbCfg: SpraxAPIdbCfg) {
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

  updateUser(mcUser: MinecraftUser, callback: (err: Error | null) => void): void {
    if (mcUser.nameHistory.length <= 0) return callback(new Error('apiRes may not be an empty array'));

    this.pool.connect((err, client, done) => {
      if (err) return callback(err);

      client.query('BEGIN', (err) => {
        if (this.shouldAbortTransaction(client, done, err)) return callback(err);

        // Store latest profile
        client.query('INSERT INTO profiles(id,name_lower,raw_json) VALUES($1,$2,$3) ON CONFLICT(id) DO UPDATE SET name_lower =$2, raw_json =$3, last_update =CURRENT_TIMESTAMP;',
          [mcUser.id.toLowerCase(), mcUser.name.toLowerCase(), mcUser.toOriginal()], (err, _res) => {
            if (this.shouldAbortTransaction(client, done, err)) return callback(err);

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
              if (this.shouldAbortTransaction(client, done, err)) return callback(err);

              client.query('COMMIT', (err) => {
                if (err) return callback(err);  // TODO Log to file

                done();
                return callback(null);
              });
            });
          });
      });
    });
  }

  getUserAgent(name: string, internal: boolean, callback: (err: Error | null, userAgent?: UserAgent) => void): void {
    this.pool.connect((err, client, done) => {
      if (err) return callback(err);

      client.query('BEGIN', (err) => {
        if (this.shouldAbortTransaction(client, done, err)) return callback(err);

        client.query(`SELECT * FROM user_agents WHERE name =$1 AND internal =$2;`, [name, internal], (err, res) => {
          if (this.shouldAbortTransaction(client, done, err)) return callback(err);

          if (res.rows.length > 0) {
            client.query('COMMIT', (err) => {
              if (err) console.error('Error committing transaction', err);  // TODO Log to file

              done();
            });

            return callback(null, { id: res.rows[0].id, name: res.rows[0].name, internal: res.rows[0].internal });
          }

          client.query(`INSERT INTO user_agents(name,internal) VALUES($1,$2) RETURNING *;`,
            [name, internal], (err, res) => {
              if (this.shouldAbortTransaction(client, done, err)) return callback(err);

              callback(null, { id: res.rows[0].id, name: res.rows[0].name, internal: res.rows[0].internal });

              client.query('COMMIT', (err) => {
                if (err) console.error('Error committing transaction', err);  // TODO Log to file

                done();
              });
            });
        });
      });
    });
  }

  addSkin(originalPng: Buffer, cleanPng: Buffer, originalURL: string, textureValue: string | null, textureSignature: string | null, userAgent: UserAgent, callback: (err: Error | null, skin: Skin | null) => void): void {
    const cleanHash = generateHash(cleanPng);

    this.pool.connect((err, client, done) => {
      if (err) return callback(err, null);

      client.query('BEGIN', (err) => {
        if (this.shouldAbortTransaction(client, done, err)) return callback(err, null);

        client.query(`SELECT * FROM skins WHERE original_url =$1 LIMIT 1;`, [originalURL], (err, res) => {
          if (this.shouldAbortTransaction(client, done, err)) return callback(err, null);

          if (res.rows.length > 0) { // Exact same Skin-URL already in db
            client.query('COMMIT', (err) => {
              if (err) console.error('Error committing transaction', err);  // TODO Log to file

              done();
            });

            return callback(null, {
              id: res.rows[0].id,
              duplicateOf: res.rows[0].duplicate_of,
              originalURL: res.rows[0].original_url,
              textureValue: res.rows[0].texture_value,
              textureSignature: res.rows[0].texture_signature,
              added: res.rows[0].added,
              addedBy: res.rows[0].added_by,
              cleanHash: res.rows[0].clean_hash
            });
          }

          client.query(`SELECT * FROM skins WHERE clean_hash =$1 AND duplicate_of IS NULL LIMIT 1;`, [cleanHash], (err, res) => {
            if (this.shouldAbortTransaction(client, done, err)) return callback(err, null);

            const duplicateID: number | null = res.rows.length > 0 ? res.rows[0].id : null,
              isDuplicate = res.rows.length > 0;

            client.query(`INSERT INTO skins(duplicate_of,original_url,texture_value,texture_signature,clean_hash,added_by)VALUES($1,$2,$3,$4,$5,$6) RETURNING *;`,
              [duplicateID, originalURL, textureValue, textureSignature, (isDuplicate ? null : cleanHash), userAgent.id], (err, res) => {
                if (this.shouldAbortTransaction(client, done, err)) return callback(err, null);

                const resultSkin: Skin = {
                  id: res.rows[0].id,
                  duplicateOf: res.rows[0].duplicate_of,
                  originalURL: res.rows[0].original_url,
                  textureValue: res.rows[0].texture_value,
                  textureSignature: res.rows[0].texture_signature,
                  added: res.rows[0].added,
                  addedBy: res.rows[0].added_by,
                  cleanHash: res.rows[0].clean_hash
                };

                if (!isDuplicate) {
                  client.query(`INSERT INTO skin_images(skin_id,original,clean)VALUES($1,$2,$3);`,
                    [resultSkin.id, originalPng, cleanPng], (err, _res) => {
                      if (this.shouldAbortTransaction(client, done, err)) return callback(err, null);

                      callback(null, resultSkin);

                      client.query('COMMIT', (err) => {
                        if (err) console.error('Error committing transaction', err);  // TODO Log to file

                        done();
                      });
                    });
                } else {
                  callback(null, resultSkin);

                  client.query('COMMIT', (err) => {
                    if (err) console.error('Error committing transaction', err);  // TODO Log to file

                    done();
                  });
                }
              });
          });
        });
      });
    });
  }

  addSkinToUserHistory(mcUser: MinecraftUser, skin: Skin, callback: (err: Error | null) => void): void {
    this.pool.connect((err, client, done) => {
      if (err) return callback(err);

      client.query('BEGIN', (err) => {
        if (this.shouldAbortTransaction(client, done, err)) return callback(err);

        client.query(`SELECT EXISTS(SELECT * FROM (SELECT skin_id FROM skin_history WHERE profile_id =$1 ORDER BY added DESC LIMIT 1)x WHERE skin_id =$2);`, [mcUser.id, skin.id], (err, res) => {
          if (this.shouldAbortTransaction(client, done, err)) return callback(err);

          if (res.rows[0].exists) { // Skin hasn't changed
            client.query('COMMIT', (err) => {
              if (err) console.error('Error committing transaction', err);  // TODO Log to file

              done();
            });

            return callback(null);
          }

          client.query(`INSERT INTO skin_history(profile_id,skin_id) VALUES($1,$2);`,
            [mcUser.id, skin.id], (err, res) => {
              if (this.shouldAbortTransaction(client, done, err)) return callback(err);

              callback(null);

              client.query('COMMIT', (err) => {
                if (err) console.error('Error committing transaction', err);  // TODO Log to file

                done();
              });
            });
        });
      });
    });
  }

  addCape(capePng: Buffer, type: CapeType, originalURL: string, textureValue: string | null, textureSignature: string | null, userAgent: UserAgent, callback: (err: Error | null, cape: Cape | null) => void): void {
    const cleanHash = generateHash(capePng);

    this.pool.connect((err, client, done) => {
      if (err) return callback(err, null);

      client.query('BEGIN', (err) => {
        if (this.shouldAbortTransaction(client, done, err)) return callback(err, null);

        client.query(`SELECT * FROM capes WHERE clean_hash =$1 AND type =$2 LIMIT 1;`, [cleanHash, type], (err, res) => {
          if (this.shouldAbortTransaction(client, done, err)) return callback(err, null);

          if (res.rows.length > 0) { // Exact same Cape-URL already in db
            client.query('COMMIT', (err) => {
              if (err) console.error('Error committing transaction', err);  // TODO Log to file

              done();
            });

            return callback(null, {
              id: res.rows[0].id,
              type: res.rows[0].type as CapeType,
              duplicateOf: res.rows[0].duplicate_of,
              originalURL: res.rows[0].original_url,
              addedBy: res.rows[0].added_by,
              added: res.rows[0].added,
              cleanHash: res.rows[0].clean_hash,
              textureValue: res.rows[0].texture_value,
              textureSignature: res.rows[0].texture_signature
            });
          }

          client.query(`SELECT * FROM capes WHERE clean_hash =$1 AND duplicate_of IS NULL LIMIT 1;`, [cleanHash], (err, res) => {
            if (this.shouldAbortTransaction(client, done, err)) return callback(err, null);

            const duplicateID: number | null = res.rows.length > 0 ? res.rows[0].id : null,
              isDuplicate = res.rows.length > 0;

            client.query(`INSERT INTO capes(type,duplicate_of,original_url,added_by,clean_hash,texture_value,texture_signature)VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *;`,
              [type, duplicateID, originalURL, userAgent.id, (isDuplicate ? null : cleanHash), textureValue, textureSignature], (err, res) => {
                if (this.shouldAbortTransaction(client, done, err)) return callback(err, null);

                const resultCape: Cape = {
                  id: res.rows[0].id,
                  type: res.rows[0].type as CapeType,
                  duplicateOf: res.rows[0].duplicate_of,
                  originalURL: res.rows[0].original_url,
                  addedBy: res.rows[0].added_by,
                  added: res.rows[0].added,
                  cleanHash: res.rows[0].clean_hash,
                  textureValue: res.rows[0].texture_value,
                  textureSignature: res.rows[0].texture_signature
                };

                if (!isDuplicate) {
                  client.query(`INSERT INTO cape_images(cape_id,original)VALUES($1,$2);`,
                    [resultCape.id, capePng], (err, _res) => {
                      if (this.shouldAbortTransaction(client, done, err)) return callback(err, null);

                      callback(null, resultCape);

                      client.query('COMMIT', (err) => {
                        if (err) console.error('Error committing transaction', err);  // TODO Log to file

                        done();
                      });
                    });
                } else {
                  callback(null, resultCape);

                  client.query('COMMIT', (err) => {
                    if (err) console.error('Error committing transaction', err);  // TODO Log to file

                    done();
                  });
                }
              });
          });
        });
      });
    });
  }

  addCapeToUserHistory(mcUser: MinecraftUser, cape: Cape, callback: (err: Error | null) => void): void {
    this.pool.connect((err, client, done) => {
      if (err) return callback(err);

      client.query('BEGIN', (err) => {
        if (this.shouldAbortTransaction(client, done, err)) return callback(err);

        client.query(`SELECT EXISTS(SELECT * FROM (SELECT cape_id FROM cape_history WHERE profile_id =$1 AND cape_type =$2 ORDER BY added DESC LIMIT 1)x WHERE cape_id =$3);`,
          [mcUser.id, cape.type, cape.id], (err, res) => {
            if (this.shouldAbortTransaction(client, done, err)) return callback(err);

            if (res.rows[0].exists) { // Skin hasn't changed
              client.query('COMMIT', (err) => {
                if (err) console.error('Error committing transaction', err);  // TODO Log to file

                done();
              });

              return callback(null);
            }

            client.query(`INSERT INTO cape_history(profile_id,cape_id,cape_type) VALUES($1,$2,$3);`,
              [mcUser.id, cape.id, cape.type], (err, _res) => {
                if (this.shouldAbortTransaction(client, done, err)) return callback(err);

                callback(null);

                client.query('COMMIT', (err) => {
                  if (err) console.error('Error committing transaction', err);  // TODO Log to file

                  done();
                });
              });
          });
      });
    });
  }

  private shouldAbortTransaction(client: PoolClient, done: (release?: any) => void, err: Error): boolean {
    if (err) {
      console.error('Error in transaction', err); // TODO log to file

      client.query('ROLLBACK', (err) => {
        if (err) console.error('Error rolling back client', err); // TODO log to file

        done();
      });
    }

    return !!err;
  }
}