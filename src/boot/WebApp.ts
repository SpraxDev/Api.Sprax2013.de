import { container } from 'tsyringe';
import AppConfiguration from '../config/AppConfiguration.js';
import { IS_PRODUCTION } from '../constants.js';
import DatabaseClient from '../database/DatabaseClient.js';
import TaskScheduler from '../task_queue/TaskScheduler.js';
import FastifyWebServer from '../webserver/FastifyWebServer.js';
import App from './App.js';

export default class WebApp implements App {
  private taskScheduler: TaskScheduler | undefined;
  private webServer: FastifyWebServer | undefined;

  async boot(): Promise<void> {
    if (IS_PRODUCTION) {
      await container.resolve(DatabaseClient).runDatabaseMigrations();
    }

    this.taskScheduler = container.resolve(TaskScheduler);

    const appConfig = container.resolve(AppConfiguration);
    this.webServer = container.resolve(FastifyWebServer);

    this.taskScheduler.start();
    await this.webServer.listen('0.0.0.0', appConfig.config.serverPort);

    this.printReadyMessage(appConfig);
  }

  async shutdown(): Promise<void> {
    this.taskScheduler?.dispose();
    this.taskScheduler = undefined;

    await this.webServer?.shutdown();
    this.webServer = undefined;
  }

  private printReadyMessage(appConfig: AppConfiguration): void {
    let suffix = '';
    if (!IS_PRODUCTION) {
      suffix = ` (http://127.0.0.1:${appConfig.config.serverPort}/)`;
    }

    console.log(`\nApplication is ready to accept requests${suffix}`);
  }
}
