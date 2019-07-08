initStorage(() => {
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
});

async function initStorage(callback) {
  const fs = require('fs'),
    request = require('request');

  if (!fs.existsSync('./storage/static/')) {
    fs.mkdirSync('./storage/static/', { recursive: true });
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

  // if (!fs.existsSync('./storage/misc.json')) {
  //   fs.writeFileSync('./storage/misc.json', JSON.stringify(
  //     {
  //       CookieSecret: require('crypto').createHash('sha256').update(require('uuid/v4')()).update(require('crypto').randomBytes(256)).digest('hex')
  //     }
  //     , null, 4));

  //   console.log('./storage/misc.json has been created!');
  // }

  if (!fs.existsSync('./storage/tokens.json')) {
    fs.writeFileSync('./storage/tokens.json', JSON.stringify(
      {
        exampleToken: ['PERMISSION1', 'PERMISSION2']
      }
      , null, 4));

    console.log('./storage/tokens.json has been created!');
  }

  // Download files that are required later
  if (!fs.existsSync('./storage/static/steve.png')) {
    request('https://textures.minecraft.net/texture/66fe51766517f3d01cfdb7242eb5f34aea9628a166e3e40faf4c1321696', { encoding: null })
      .pipe(fs.createWriteStream('./storage/static/steve.png'));
  }
  if (!fs.existsSync('./storage/static/alex.png')) {
    request('https://textures.minecraft.net/texture/63b098967340daac529293c24e04910509b208e7b94563c3ef31dec7b3750', { encoding: null })
      .pipe(fs.createWriteStream('./storage/static/alex.png'));
  }

  if (callback) {
    callback();
  }
}

// TODO: Disconnect from db etc.
// process.on('SIGINT', function () {
//   db.stop(function (err) {
//     process.exit(err ? 1 : 0);
//   });
// });