import { container } from 'tsyringe';
import ContinuousQueueWorker from '../import_queue/worker/ContinuousQueueWorker.js';
import App from './App.js';

export default class QueueWorkerApp implements App {
  async boot(): Promise<void> {
    //noinspection ES6MissingAwait
    container
      .resolve(ContinuousQueueWorker)
      .start();

    console.log('\nQueue worker finished initialization');
  }

  async shutdown(): Promise<void> {
    // nothing to explicitly shut down here
  }
}
