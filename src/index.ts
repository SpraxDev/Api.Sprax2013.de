import fs = require('fs');
import objectAssignDeep = require('object-assign-deep');
import path = require('path');
import rfs = require('rotating-file-stream');

import { Server, createServer } from 'http';

import { dbUtils } from './dbUtils';
import { SpraxAPIcfg, SpraxAPIdbCfg } from './global';

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
  logging: {
    accessLogFormat: '[:date[web]] :remote-addr by :remote-user | :method :url :status with :res[content-length] bytes | ":user-agent" referred from ":referrer" | :response-time[3] ms',
    discordErrorWebHookURL: null
  }
};
export let dbCfg: SpraxAPIdbCfg = {
  enabled: false,
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
export const appVersion = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf-8')).version;

/* Init configuration files */

if (!fs.existsSync(path.join(process.cwd(), 'storage'))) {
  fs.mkdirSync(path.join(process.cwd(), 'storage'));
}

if (fs.existsSync(path.join(process.cwd(), 'storage', 'config.json'))) {
  cfg = objectAssignDeep({}, cfg, JSON.parse(fs.readFileSync(path.join(process.cwd(), 'storage', 'config.json'), 'utf-8'))); // Merge existing cfg into default one
}
fs.writeFileSync(path.join(process.cwd(), 'storage', 'config.json'), JSON.stringify(cfg, null, 2));  // Write current config (+ missing default values) to file

// Repeat above for db.json
if (fs.existsSync(path.join(process.cwd(), 'storage', 'db.json'))) {
  dbCfg = objectAssignDeep({}, dbCfg, JSON.parse(fs.readFileSync(path.join(process.cwd(), 'storage', 'db.json'), 'utf-8')));
}
fs.writeFileSync(path.join(process.cwd(), 'storage', 'db.json'), JSON.stringify(dbCfg, null, 2));

/* Register shutdown hook */
function shutdownHook() {
  console.log('Shutting down...');

  const ready = async () => {
    try {
      if (db) {
        await db.shutdown();
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

export const webAccessLogStream = rfs.createStream('access.log', { interval: '1d', maxFiles: 14, path: path.join(process.cwd(), 'logs', 'access'), compress: true }),
  errorLogStream = rfs.createStream('error.log', { interval: '1d', maxFiles: 90, path: path.join(process.cwd(), 'logs', 'error') });

/* Start webserver (and test database connection) */
db.isReady((err) => {
  if (err) {
    console.error(`Database is not ready! (${err.message})`);
    process.exit(2);
  }

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
});