import './container-init.js';
import { container } from 'tsyringe';
import { IS_PRODUCTION } from './constants.js';
import DatabaseClient from './database/DatabaseClient.js';
import SentrySdk from './SentrySdk.js';
import FastifyWebServer from './webserver/FastifyWebServer.js';

let webServer: FastifyWebServer | undefined;

await bootstrap();

async function bootstrap(): Promise<void> {
  await SentrySdk.init();
  registerShutdownHooks();

  if (IS_PRODUCTION) {
    await container.resolve(DatabaseClient).runDatabaseMigrations();
  }

  webServer = container.resolve(FastifyWebServer);
  await webServer.listen('0.0.0.0', 8087);

  console.log();
  if (!IS_PRODUCTION) {
    console.log('RUNNING IN DEVELOPMENT MODE');
  }
  console.log(`Application is ready to accept requests (http://127.0.0.1:8087/)`);
}

function registerShutdownHooks(): void {
  const handleShutdown = async () => {
    console.log('Shutting down...');

    await webServer?.shutdown();
    webServer = undefined;

    await SentrySdk.shutdown();

    console.log('Finished graceful shutdown.');
    process.exit(0);
  };

  process.on('SIGTERM', handleShutdown);
  process.on('SIGINT', handleShutdown);
  process.on('SIGQUIT', handleShutdown);
  process.on('SIGHUP', handleShutdown);
}
