import { container } from 'tsyringe';
import CliArgumentProvider from '../cli/CliArgumentProvider.js';
import ContinuousQueueWorker from '../import_queue/worker/ContinuousQueueWorker.js';
import TaskScheduler from '../task_queue/TaskScheduler.js';
import App from './App.js';

export default class QueueWorkerApp implements App {
  private taskScheduler: TaskScheduler | undefined;

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

    console.log('\nQueue worker finished initialization');
  }

  async shutdown(): Promise<void> {
    this.taskScheduler?.dispose();
    this.taskScheduler = undefined;
  }
}
