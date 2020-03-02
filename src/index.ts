import fs = require('fs');
import rfs = require('rotating-file-stream');
import path = require('path');
import { Server, createServer } from 'http';
import { SpraxAPIcfg, SpraxAPIdbCfg } from './global';
import { dbUtils } from './dbUtils';

let server: Server;
export let db: dbUtils;
export let cfg: SpraxAPIcfg = {
  listen: {
    usePath: false,
    path: './SpraxAPI.unixSocket',

    host: '127.0.0.1',
    port: 8091
  },
  trustProxy: false,
  accessLogFormat: '[:date[web]] :remote-addr by :remote-user | :method :url :status with :res[content-length] bytes | ":user-agent" referred from ":referrer" | :response-time[3] ms'
};
export let dbCfg: SpraxAPIdbCfg = {
  host: '127.0.0.1',
  port: 5432,
  user: 'user007',
  password: 's3cr3t!',
  ssl: false,
  connectionPoolSize: 16,

  databases: {
    skindb: 'skindb'
  }
};

/* Init configuration files */

if (!fs.existsSync('./storage')) {
  fs.mkdirSync('./storage');
}

if (fs.existsSync('./storage/config.json')) {
  cfg = Object.assign({}, cfg, JSON.parse(fs.readFileSync('./storage/config.json', 'utf-8')));  // Merge existing cfg into default one
}
fs.writeFileSync('./storage/config.json', JSON.stringify(cfg, null, 2));  // Write current config (+ missing default values) to file

// Repeat above for db.json
if (fs.existsSync('./storage/db.json')) {
  dbCfg = Object.assign({}, dbCfg, JSON.parse(fs.readFileSync('./storage/db.json', 'utf-8')));
}
fs.writeFileSync('./storage/db.json', JSON.stringify(dbCfg, null, 2));

/* Register shutdown hook */

function shutdownHook() {
  console.log('Shutting down...');

  const ready = async () => {
    try {
      if (db) {
        await db.pool.end();
      }
    } catch (ex) {
      console.error(ex);
    }

    process.exit();
  };

  server.close((err) => {
    if (err && err.message != 'Server is not running.') console.error(err);

    ready();
  });
}

process.on('SIGTERM', shutdownHook);
process.on('SIGINT', shutdownHook);
process.on('SIGQUIT', shutdownHook);
process.on('SIGHUP', shutdownHook);
process.on('SIGUSR2', shutdownHook);  // The package 'nodemon' is using this signal

/* Prepare webserver */
db = new dbUtils(dbCfg);

export const webAccessLogStream = rfs.createStream('access.log', { interval: '1d', maxFiles: 14, path: path.join(__dirname, 'logs', 'access'), compress: true }),
  errorLogStream = rfs.createStream('error.log', { interval: '1d', maxFiles: 90, path: path.join(__dirname, 'logs', 'error') });

/* Start webserver */
server = createServer(require('./server').app);

server.on('error', (err: { syscall: string, code: string }) => {
  if (err.syscall !== 'listen') {
    throw err;
  }

  const errPrefix = cfg.listen.usePath ? `path ${cfg.listen.path}` : `port ${cfg.listen.port}`;
  switch (err.code) {
    case 'EACCES':
      console.error(`${errPrefix} requires elevated privileges`);
      process.exit(1);
      break;
    case 'EADDRINUSE':
      console.error(`${errPrefix} is already in use`);
      process.exit(1);
      break;
    default:
      throw err;
  }
});
server.on('listening', () => {
  console.log(`Listening on ${cfg.listen.usePath ? `path ${cfg.listen.path}` : `port ${cfg.listen.port}`}`);
});

if (cfg.listen.usePath) {
  const unixSocketPath = cfg.listen.path,
    unixSocketPIDPath = cfg.listen.path + '.pid',
    parentDir = require('path').dirname(unixSocketPath);

  if (!fs.existsSync(parentDir)) {
    fs.mkdirSync(parentDir, { recursive: true });
  }

  const isProcessRunning = (pid: number): boolean => {
    try {
      process.kill(pid, 0);
      return true;
    } catch (ex) {
      return ex.code == 'EPERM';
    }
  };

  if (fs.existsSync(unixSocketPath)) {
    let isRunning: boolean = false;
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
  fs.chmodSync(unixSocketPath, '0777');
} else {
  server.listen(cfg.listen.port, cfg.listen.host);
}