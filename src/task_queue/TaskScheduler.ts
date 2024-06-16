import { injectable } from 'tsyringe';
import TaskExecutingQueue from './TaskExecutingQueue.js';
import Task from './tasks/Task.js';
import UpdateMinecraftServerBlocklistTask from './tasks/UpdateMinecraftServerBlocklistTask.js';

@injectable()
export default class TaskScheduler {
  private readonly intervalTimeouts: NodeJS.Timeout[] = [];

  constructor(
    private readonly taskQueue: TaskExecutingQueue,
    private readonly updateMinecraftServerBlocklistTask: UpdateMinecraftServerBlocklistTask
  ) {
  }

  start(): void {
    this.scheduleAndRun(this.updateMinecraftServerBlocklistTask, 5 * 60 * 1000 /* 5m */);
  }

  shutdown(): void {
    for (const timeout of this.intervalTimeouts) {
      clearInterval(timeout);
    }
    this.intervalTimeouts.length = 0;
  }

  private scheduleAndRun(task: Task, millis: number): void {
    this.taskQueue.add(task);

    const timeout = setInterval(() => this.taskQueue.add(task), millis);
    this.intervalTimeouts.push(timeout);
  }
}
