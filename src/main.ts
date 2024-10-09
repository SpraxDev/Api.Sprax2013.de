import './container-init.js';
import { container } from 'tsyringe';
import AppConfiguration from './config/AppConfiguration.js';
import { IS_PRODUCTION } from './constants.js';
import DatabaseClient from './database/DatabaseClient.js';
import QuestDbClient from './database/QuestDbClient.js';
import LazyImportTaskCreator from './import_queue/LazyImportTaskCreator.js';
import ContinuousQueueWorker from './import_queue/worker/ContinuousQueueWorker.js';
import SentrySdk from './SentrySdk.js';
import TaskExecutingQueue from './task_queue/TaskExecutingQueue.js';
import TaskScheduler from './task_queue/TaskScheduler.js';
import FastifyWebServer from './webserver/FastifyWebServer.js';

let taskQueue: TaskExecutingQueue | undefined;
let taskScheduler: TaskScheduler | undefined;
let webServer: FastifyWebServer | undefined;
let questDbClient: QuestDbClient | undefined;
let lazyImportTaskCreator: LazyImportTaskCreator | undefined;

await bootstrap();

async function bootstrap(): Promise<void> {
  registerShutdownHooks();

  if (IS_PRODUCTION) {
    await container.resolve(DatabaseClient).runDatabaseMigrations();
  }

  questDbClient = container.resolve(QuestDbClient);
  lazyImportTaskCreator = container.resolve(LazyImportTaskCreator);

  taskQueue = container.resolve(TaskExecutingQueue);
  taskScheduler = container.resolve(TaskScheduler);

  // TODO: refactor this hacky queue-worker-bootstrap
  if (process.argv.includes('--spraxapi-run-as-queue-worker')) {
    const continuousQueueWorker = container.resolve(ContinuousQueueWorker);
    //noinspection ES6MissingAwait
    continuousQueueWorker.start();

    console.log();
    if (!IS_PRODUCTION) {
      console.log(`RUNNING QUEUE WORKER IN DEVELOPMENT MODE`);
    }
    console.log('Queue worker finished initialization');
    return;
  }

  const appConfig = container.resolve(AppConfiguration);

  webServer = container.resolve(FastifyWebServer);

  taskScheduler.start();
  await webServer.listen('0.0.0.0', appConfig.config.serverPort);

  console.log();
  if (!IS_PRODUCTION) {
    console.log(`RUNNING IN DEVELOPMENT MODE (http://127.0.0.1:${appConfig.config.serverPort}/)`);
  }
  console.log('Application is ready to accept requests');
}

function registerShutdownHooks(): void {
  let shutdownInProgress = false;
  const handleShutdown = async () => {
    if (shutdownInProgress) {
      console.warn('Received seconds shutdown signal – Forcing shutdown');
      process.exit(90);
    }

    shutdownInProgress = true;
    console.log('Shutting down...');

    taskScheduler?.shutdown();
    taskScheduler = undefined;

    taskQueue?.shutdown();
    taskQueue = undefined;

    await webServer?.shutdown();
    webServer = undefined;

    await questDbClient?.shutdown();
    questDbClient = undefined;

    await lazyImportTaskCreator?.waitForDanglingPromises();
    lazyImportTaskCreator = undefined;

    await SentrySdk.shutdown();

    console.log('Finished graceful shutdown.');
    process.exit(0);
  };

  process.on('SIGTERM', handleShutdown);
  process.on('SIGINT', handleShutdown);
  process.on('SIGQUIT', handleShutdown);
  process.on('SIGHUP', handleShutdown);
}
