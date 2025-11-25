import { container } from 'tsyringe';
import CliArgumentProvider from '../cli/CliArgumentProvider.js';
import AppConfiguration from '../config/AppConfiguration.js';
import ContinuousQueueWorker from '../import_queue/worker/ContinuousQueueWorker.js';
import TaskScheduler from '../task_queue/TaskScheduler.js';
import FastifyWebServer from '../webserver/FastifyWebServer.js';
import App from './App.js';

export default class QueueWorkerApp implements App {
  private taskScheduler: TaskScheduler | undefined;
  private webServer: FastifyWebServer | undefined;

  async boot(): Promise<void> {
    if (CliArgumentProvider.determineLeftoverArgs().length !== 0) {
      throw new Error('Invalid number of arguments');
    }

    this.taskScheduler = container.resolve(TaskScheduler);
    this.taskScheduler.start(false);

    //noinspection ES6MissingAwait
    container
      .resolve(ContinuousQueueWorker)
      .start();

    // DEBUG
    const appConfig = container.resolve(AppConfiguration);
    this.webServer = container.resolve(FastifyWebServer);

    await this.webServer.listen(appConfig.config.serverInterface, appConfig.config.serverPort + 100);
    // DEBUG END

    console.log('\nQueue worker finished initialization');
  }

  async shutdown(): Promise<void> {
    this.taskScheduler?.dispose();
    this.taskScheduler = undefined;

    await this.webServer?.shutdown();
    this.webServer = undefined;
  }
}
