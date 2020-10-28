import fs = require('fs');
import path = require('path');
import readline = require('readline');

import { dbUtils } from './utils/database';
import { Pool } from 'pg';

let db: dbUtils;

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log('!! Please make sure you\'ve already run the latest version at least once and configured the database !!');
console.log('Press \'y\' to continue or \'q\' to quit.');

let run = true;

rl.question('> ', (input) => {
  if (input.toLowerCase() != 'y') return exit();

  db = new dbUtils(JSON.parse(fs.readFileSync(path.join(process.cwd(), 'storage', 'db.json'), 'utf-8')));

  if (!db.isAvailable()) {
    return exit('Database access has been disabled in storage/db.json');
  }

  console.log('Connecting to database...');
  db.isReady()
      .then(async () => {
        console.log('Success!');

        while (run) {
          console.log('Please use one of the following commands:');
          console.log('fixHistory [skin|cape] - Removes any duplicate rows (e.g. User changed skin with id 12 and 2 seconds later again with id 12)');
          console.log('quit - Exits the application');

          await new Promise((resolve, reject) => {
            rl.question('> ', async (input) => {
              const args = input.trim().split(' ');

              try {
                if (args[0].toLowerCase().startsWith('fixhistory')) {
                  if (args.length <= 1 || (args[1].toLowerCase() != 'skin' && args[1].toLowerCase() != 'cape')) {
                    console.log('Invalid argument - Allowed: skin, cape');
                    return resolve();
                  }

                  console.log('Starting... This may take a couple of minutes/hours/days');

                  let i = 0;

                  const pool: Pool = db.getPool() as Pool;

                  const table = args[1].toLowerCase() == 'skin' ? 'skin_history' : 'cape_history';
                  const idArg = args[1].toLowerCase() == 'skin' ? 'skin_id' : 'cape_id';

                  while (true) {
                    const res = await pool.query(`SELECT * FROM ${table} ORDER BY profile_id,added LIMIT 2500 OFFSET $1;`, [i * 2500]);

                    if (res.rows.length == 0) break;

                    let prevRow: { profile_id: string, [idArg: string]: string } = {profile_id: '', [idArg]: ''};
                    for (const row of res.rows) {
                      if (row.profile_id == prevRow.profile_id) {
                        if (row[idArg] == prevRow[idArg]) { // last skin/cape has same id => is duplicate
                          console.log('Deleting', row);

                          try {
                            await pool.query(`DELETE FROM ${table} WHERE profile_id =$1 AND ${idArg} =$2 AND added =$3;`, [row.profile_id, row[idArg], row.added]);
                          } catch (err) {
                            console.error(err);
                          }
                        }
                      }

                      prevRow = row;
                    }

                    i++;
                  }

                  console.log('Done!');
                } else if (args[0].toLowerCase() == 'quit' || args[0].toLowerCase() == 'q') {
                  return exit();
                } else {
                  console.log('Invalid command');
                }

                return resolve();
              } catch (err) {
                return reject(err);
              }
            });
          });
        }
      })
      .catch((err) => exit(`Databse connection failed: ${err.message}`));
});

function exit(err?: string): never {
  run = false;
  rl.close();

  if (err) {
    console.error(err);
  } else {
    console.log('Exiting...');
  }

  process.exit(err ? 1 : 0);
}