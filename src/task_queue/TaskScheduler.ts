import { injectable } from 'tsyringe';
import TaskExecutingQueue from './TaskExecutingQueue.js';
import ClearExpiredEntriesInSetsWithTtlTask from './tasks/ClearExpiredEntriesInSetsWithTtlTask.js';
import ProxyPoolHttpClientHealthcheckTask from './tasks/ProxyPoolHttpClientHealthcheckTask.js';
import Task from './tasks/Task.js';
import UpdateMinecraftServerBlocklistTask from './tasks/UpdateMinecraftServerBlocklistTask.js';

@injectable()
export default class TaskScheduler {
  private readonly intervalTimeouts: NodeJS.Timeout[] = [];

  constructor(
    private readonly taskQueue: TaskExecutingQueue,
    private readonly updateMinecraftServerBlocklistTask: UpdateMinecraftServerBlocklistTask,
    private readonly clearExpiredEntriesInSetsWithTtlTask: ClearExpiredEntriesInSetsWithTtlTask,
    private readonly proxyPoolHttpClientHealthcheckTask: ProxyPoolHttpClientHealthcheckTask
  ) {
  }

  start(): void {
    const fiveMinutes = 5 * 60 * 1000;

    this.scheduleAndRunDelayed(this.proxyPoolHttpClientHealthcheckTask, 30_000);
    this.scheduleAndRunDelayed(this.updateMinecraftServerBlocklistTask, fiveMinutes);
    this.scheduleAndRunDelayed(this.clearExpiredEntriesInSetsWithTtlTask, fiveMinutes);
  }

  shutdown(): void {
    for (const timeout of this.intervalTimeouts) {
      clearInterval(timeout);
    }
    this.intervalTimeouts.length = 0;
  }

  private scheduleAndRunDelayed(task: Task, millis: number): void {
    setTimeout(() => this.taskQueue.add(task), 1000);

    const timeout = setInterval(() => this.taskQueue.add(task), millis);
    this.intervalTimeouts.push(timeout);
  }
}
