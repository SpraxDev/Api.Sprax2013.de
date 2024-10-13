import './container-init.js';
import { container } from 'tsyringe';
import type App from './boot/App.js';
import QueueWorkerApp from './boot/QueueWorkerApp.js';
import WebApp from './boot/WebApp.js';
import { IS_PRODUCTION } from './constants.js';
import SentrySdk from './util/SentrySdk.js';

let app: App | undefined;

await bootstrap();

async function bootstrap(): Promise<void> {
  registerShutdownHooks();

  if (process.argv.includes('--spraxapi-run-as-queue-worker')) {
    app = new QueueWorkerApp();
  } else {
    app = new WebApp();
  }

  await app.boot();
  if (!IS_PRODUCTION) {
    console.log(`RUNNING IN DEVELOPMENT MODE`);
  }
}

function registerShutdownHooks(): void {
  let shutdownInProgress = false;
  const handleShutdown = async () => {
    if (shutdownInProgress) {
      console.warn('Received second shutdown signal – Forcing shutdown');
      process.exit(90);
    }

    shutdownInProgress = true;
    console.log('Shutting down...');

    await app?.shutdown();
    await container.dispose();

    await SentrySdk.shutdown();

    console.log('Finished graceful shutdown.');
    process.exit(0);
  };

  process.on('SIGTERM', handleShutdown);
  process.on('SIGINT', handleShutdown);
  process.on('SIGQUIT', handleShutdown);
  process.on('SIGHUP', handleShutdown);
}
