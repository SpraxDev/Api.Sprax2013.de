import { clearInterval } from 'node:timers';
import { Disposable, injectable } from 'tsyringe';
import SentrySdk from '../util/SentrySdk.js';
import TaskExecutingQueue from './TaskExecutingQueue.js';
import ClearExpiredEntriesInSetsWithTtlTask from './tasks/ClearExpiredEntriesInSetsWithTtlTask.js';
import ProxyPoolHttpClientHealthcheckTask from './tasks/ProxyPoolHttpClientHealthcheckTask.js';
import Task from './tasks/Task.js';
import UpdateMinecraftServerBlocklistTask from './tasks/UpdateMinecraftServerBlocklistTask.js';
import WriteImportQueueSizeToQuestDBTask from './tasks/WriteImportQueueSizeToQuestDBTask.js';

@injectable()
export default class TaskScheduler implements Disposable {
  private readonly intervalTimeouts: NodeJS.Timeout[] = [];

  constructor(
    private readonly taskQueue: TaskExecutingQueue,
    private readonly updateMinecraftServerBlocklistTask: UpdateMinecraftServerBlocklistTask,
    private readonly clearExpiredEntriesInSetsWithTtlTask: ClearExpiredEntriesInSetsWithTtlTask,
    private readonly proxyPoolHttpClientHealthcheckTask: ProxyPoolHttpClientHealthcheckTask,
    private readonly writeImportQueueSizeToQuestDBTask: WriteImportQueueSizeToQuestDBTask
  ) {
  }

  start(isWebApp: boolean): void {
    const fiveMinutes = 5 * 60 * 1000;

    this.scheduleAndRunDelayed(this.proxyPoolHttpClientHealthcheckTask, 30_000);
    this.scheduleAndRunDelayed(this.clearExpiredEntriesInSetsWithTtlTask, fiveMinutes);

    if (isWebApp) {
      this.scheduleAndRunDelayed(this.updateMinecraftServerBlocklistTask, fiveMinutes);
      this.scheduleAndRunDelayed(this.writeImportQueueSizeToQuestDBTask, fiveMinutes / 2);
    }
  }

  dispose(): void {
    for (const timeout of this.intervalTimeouts) {
      clearInterval(timeout);
    }
    this.intervalTimeouts.length = 0;
  }

  runRepeating(callback: () => Promise<void> | void, intervalMillis: number): void {
    this.intervalTimeouts.push(setInterval(() => {
      try {
        callback();
      } catch (err: any) {
        SentrySdk.logAndCaptureError(err);
      }
    }, intervalMillis));
  }

  private scheduleAndRunDelayed(task: Task, millis: number): void {
    setTimeout(() => this.taskQueue.add(task), 1000);

    const timeout = setInterval(() => this.taskQueue.add(task), millis);
    this.intervalTimeouts.push(timeout);
  }
}
