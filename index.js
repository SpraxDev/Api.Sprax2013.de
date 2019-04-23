initStorage();

const http = require('http');

const server = http.createServer(require('./server'));
server.on('error', (err) => {
  if (err.syscall !== 'listen') {
    throw err;
  }

  switch (err.code) {
    case 'EACCES':
      console.error(`Port ${process.env.PORT || 8091} requires elevated privileges`);
      process.exit(1);
      break;
    case 'EADDRINUSE':
      console.error(`Port ${process.env.PORT || 8091} is already in use`);
      process.exit(1);
      break;
    default:
      throw err;
  }
});
server.listen(process.env.PORT || 8091, process.env.HOST || '127.0.0.1');

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