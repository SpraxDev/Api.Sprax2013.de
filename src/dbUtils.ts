import { Pool } from 'pg';
import { SpraxAPIdbCfg, MinecraftProfile } from './global';

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

  updateUUID(apiRes: { id: string, name: string }, callback: (err: Error | null) => void): void {
    this.pool.query(
      'INSERT INTO profiles(id,name_lower,raw_json) VALUES($1,$2,NULL) ON CONFLICT(id) DO NOTHING;',
      [apiRes.id.toLowerCase(), apiRes.name.toLowerCase()],
      (err, _res) => {
        callback(err || null);
      });
  };

  updateProfile(profile: MinecraftProfile, callback: (err: Error | null) => void): void {
    this.pool.query(
      'INSERT INTO profiles(id,name_lower,raw_json) VALUES($1,$2,$3) ON CONFLICT(id) DO UPDATE SET name_lower =$2, raw_json =$3, last_update =CURRENT_TIMESTAMP;',
      [profile.id.toLowerCase(), profile.name.toLowerCase(), JSON.stringify(profile)],
      (err, _res) => {
        callback(err || null);
      });
  };

  updateNameHistory(profileId: string, apiRes: { name: string, changedToAt?: number }[], callback: (err: Error | null) => void): void {
    if (apiRes.length <= 0) return callback(new Error('apiRes may not be an empty array'));

    let queryStr = 'INSERT INTO name_history(profile_id,name,changed_to_at) VALUES';
    const queryArgs: (string | Date)[] = [profileId];

    let counter = 2;
    for (const elem of apiRes) {
      if (counter > 2) queryStr += ', ';

      queryStr += `($1,$${counter++},${typeof elem.changedToAt == 'number' ? `$${counter++}` : `'-infinity'`})`;

      queryArgs.push(elem.name);

      if (typeof elem.changedToAt == 'number') {
        queryArgs.push(new Date(elem.changedToAt));
      }
    }

    this.pool.query(`${queryStr} ON CONFLICT DO NOTHING;`, queryArgs, (err, _res) => {
      callback(err || null);
    });
  };
}