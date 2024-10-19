import './container-init.js';
import { container } from 'tsyringe';
import type App from './boot/App.js';
import CommandLineApp from './boot/CommandLineApp.js';
import QueueWorkerApp from './boot/QueueWorkerApp.js';
import WebApp from './boot/WebApp.js';
import CliArgumentProvider, { AppCommand } from './cli/CliArgumentProvider.js';
import { IS_PRODUCTION } from './constants.js';
import SentrySdk from './util/SentrySdk.js';

let app: App | undefined;

await bootstrap();

async function bootstrap(): Promise<void> {
  registerShutdownHooks();

  if (!IS_PRODUCTION) {
    console.log(`RUNNING IN DEVELOPMENT MODE`);
  }
  console.log();

  const parsedCliArguments = CliArgumentProvider.determineAppArguments();
  app = createApp(parsedCliArguments.command);
  await app.boot();
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
    process.exit();
  };

  process.on('SIGTERM', handleShutdown);
  process.on('SIGINT', handleShutdown);
  process.on('SIGQUIT', handleShutdown);
  process.on('SIGHUP', handleShutdown);
}

function createApp(appCommand: AppCommand): App {
  switch (appCommand) {
    case 'web':
      return new WebApp();
    case 'queue-worker':
      return new QueueWorkerApp();
    case 'cli':
      return new CommandLineApp();
  }
}
