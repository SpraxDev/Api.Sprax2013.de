let cfg;
let server;

function shutdownHook() {
  console.log('Shutting down...');

  const ready = async () => {
    try {
      await require('./db-utils/DB_SkinDB').pool.end();
      await require('./db-utils/DB_Mojang').pool.end();
    } catch (ex) { }

    process.exit();
  };

  server.close((err) => {
    if (err) console.error(err);

    ready();
  });
}

process.on('SIGTERM', shutdownHook);
process.on('SIGINT', shutdownHook);
process.on('SIGQUIT', shutdownHook);
process.on('SIGHUP', shutdownHook);
process.on('SIGUSR2', shutdownHook);  // The package 'nodemon' is using this signal

initStorage(() => {
  cfg = require('./storage/config.json');

  server = require('http').createServer(require('./server'));
  server.on('error', (err) => {
    if (err.syscall !== 'listen') {
      throw err;
    }

    switch (err.code) {
      case 'EACCES':
        console.error(
          ((cfg.listen.usePath || process.env.UNIX_PATH) ? `path ${process.env.UNIX_PATH || cfg.listen.path}` : `port ${process.env.PORT || cfg.listen.port}`) +
          ' requires elevated privileges'
        );
        process.exit(1);
        break;
      case 'EADDRINUSE':
        console.error(
          ((cfg.listen.usePath || process.env.UNIX_PATH) ? `path ${process.env.UNIX_PATH || cfg.listen.path}` : `port ${process.env.PORT || cfg.listen.port}`) +
          ' is already in use'
        );
        process.exit(1);
        break;
      default:
        throw err;
    }
  });

  server.on('listening', () => {
    console.log('Listening on ' +
      ((cfg.listen.usePath || process.env.UNIX_PATH) ? `path ${process.env.UNIX_PATH || cfg.listen.path}` : `port ${process.env.PORT || cfg.listen.port}`)
    );
  });

  if (cfg.listen.usePath || process.env.UNIX_PATH) {
    const fs = require('fs');

    const unixSocketPath = process.env.UNIX_PATH || cfg.listen.path,
      unixSocketPIDPath = (process.env.UNIX_PATH || cfg.listen.path) + '.pid',
      parentDir = require('path').dirname(unixSocketPath);

    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    if (fs.existsSync(unixSocketPath)) {
      let isRunning = false;
      if (!fs.existsSync(unixSocketPIDPath) || !(isRunning = isProcessRunning(parseInt(fs.readFileSync(unixSocketPIDPath, 'utf-8'))))) {
        fs.unlinkSync(unixSocketPath);
      }

      if (isRunning) {
        console.error(`It looks like the process that created '${unixSocketPath}' is still running!`);
        process.exit(1);
      }
    }

    fs.writeFileSync(unixSocketPIDPath, process.pid);
    server.listen(unixSocketPath);
    fs.chmodSync(unixSocketPath, 0777);
  } else {
    server.listen(process.env.PORT || cfg.listen.port, process.env.HOST || cfg.listen.host);
  }
});

async function initStorage(callback) {
  const fs = require('fs'),
    request = require('request');

  if (!fs.existsSync('./storage/static/')) {
    fs.mkdirSync('./storage/static/', { recursive: true });
  }

  if (!fs.existsSync('./storage/config.json')) {
    fs.writeFileSync('./storage/config.json', JSON.stringify(
      {
        listen: {
          usePath: false,
          path: './SpraxAPI.unixSocket',

          host: '127.0.0.1',
          port: 8091
        }
      }
      , null, 4));

    console.log('./storage/config.json has been created!');
  }

  if (!fs.existsSync('./storage/db.json')) {
    fs.writeFileSync('./storage/db.json', JSON.stringify(
      {
        host: '127.0.0.1',
        port: 3306,
        user: 'skinDB',
        password: 's3cr3t!',
        ssl: false,

        DB_SkinDB: 'SkinDB',
        DB_Mojang: 'SpraxAPI'
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

function isProcessRunning(pid) {
  try {
    return process.kill(pid, 0);
  } catch (ex) {
    return ex.code === 'EPERM';
  }
}