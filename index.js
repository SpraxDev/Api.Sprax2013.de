initStorage();
function initStorage() {
  const fs = require('fs');

  if (!fs.existsSync('./storage/')) {
    require('./utils').mkdirsSync('./storage/');
  }

  if (!fs.existsSync('./storage/db.json')) {
    fs.writeFileSync('./storage/db.json', JSON.stringify(
      {
        host: '127.0.0.1',
        port: 3306,
        user: 'skinDB',
        password: 's3cr3t!',

        DB_SkinDB: 'SkinDB_new',
        DB_Mojang: 'Mojang'
      }
      , null, 4));

    console.log('./storage/db.json has been created!');
  }
}