import fs from 'fs';
import { createServer, Server } from 'http';
import objectAssignDeep from 'object-assign-deep';
import { join as joinPath } from 'path';
import { createStream as createRotatingFileStream } from 'rotating-file-stream';

import { SpraxAPIcfg, SpraxAPIdbCfg } from './global';
import { CacheUtils } from './utils/CacheUtils';
import { dbUtils } from './utils/database';

let server: Server | null;
export let db: dbUtils;
export let cache: CacheUtils;
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
  },

  redis: {
    enabled: false,
    host: '127.0.0.1',
    port: 6379,
    password: '',
    db: 0
  }

  // proxies: []
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
export const appVersion = JSON.parse(fs.readFileSync(joinPath(__dirname, '..', 'package.json'), 'utf-8')).version;

/* Init configuration files */

if (!fs.existsSync(joinPath(process.cwd(), 'storage'))) {
  fs.mkdirSync(joinPath(process.cwd(), 'storage'));
}

if (fs.existsSync(joinPath(process.cwd(), 'storage', 'config.json'))) {
  cfg = objectAssignDeep({}, cfg, JSON.parse(fs.readFileSync(joinPath(process.cwd(), 'storage', 'config.json'), 'utf-8'))); // Merge existing cfg into default one
}
fs.writeFileSync(joinPath(process.cwd(), 'storage', 'config.json'), JSON.stringify(cfg, null, 2));  // Write current config (+ missing default values) to file

// Repeat above for db.json
if (fs.existsSync(joinPath(process.cwd(), 'storage', 'db.json'))) {
  dbCfg = objectAssignDeep({}, dbCfg, JSON.parse(fs.readFileSync(joinPath(process.cwd(), 'storage', 'db.json'), 'utf-8')));
}
fs.writeFileSync(joinPath(process.cwd(), 'storage', 'db.json'), JSON.stringify(dbCfg, null, 2));

/* Register shutdown hook */
function shutdownHook() {
  console.log('Shutting down...');

  const ready = async (): Promise<never> => {
    try {
      if (cache) {
        await cache.shutdown();
      }
    } catch (ex) {
      console.error(ex);
    }

    try {
      if (db) {
        await db.shutdown();
      }
    } catch (ex) {
      console.error(ex);
    }

    process.exit();
  };

  if (server != null) {
    server.close((err) => {
      if (err && err.message != 'Server is not running.') console.error(err);

      ready()
          .catch(console.error);
    });

    server = null;
  }
}

process.on('SIGTERM', shutdownHook);
process.on('SIGINT', shutdownHook);
process.on('SIGQUIT', shutdownHook);
process.on('SIGHUP', shutdownHook);
process.on('SIGUSR2', shutdownHook);  // The package 'nodemon' is using this signal

/* Prepare webserver */
db = new dbUtils(dbCfg);
cache = new CacheUtils();

export const webAccessLogStream = createRotatingFileStream('access.log', {
  interval: '1d',
  maxFiles: 14,
  path: joinPath(process.cwd(), 'logs', 'access'),
  compress: true
});
export const errorLogStream = createRotatingFileStream('error.log', {
  interval: '1d',
  maxFiles: 90,
  path: joinPath(process.cwd(), 'logs', 'error')
});

/* Start webserver (and test database connection) */
(async () => {
  if (dbCfg.enabled) {
    try {
      await db.isReady();
    } catch (err) {
      console.error(`Database is not ready! (${err.message})`);
    }
  }

  server = createServer(require('./server').app);

  server.on('error', (err: { syscall: string, code: string }) => {
    if (err.syscall != 'listen') {
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
      fs.mkdirSync(parentDir, {recursive: true});
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
      let runningPID: number = -1;
      if (!fs.existsSync(unixSocketPIDPath) || !(isRunning = isProcessRunning(runningPID = parseInt(fs.readFileSync(unixSocketPIDPath, 'utf-8'))))) {
        fs.unlinkSync(unixSocketPath);
      }

      if (isRunning) {
        console.error(`The process (PID: ${runningPID}) that created '${unixSocketPath}' is still running!`);
        process.exit(1);
      }
    }

    fs.writeFileSync(unixSocketPIDPath, process.pid);
    server.listen(unixSocketPath);
    fs.chmodSync(unixSocketPath, '0777');
  } else {
    server.listen(cfg.listen.port, cfg.listen.host);
  }
})();
