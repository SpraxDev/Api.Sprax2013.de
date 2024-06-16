import { singleton } from 'tsyringe';
import SentrySdk from '../SentrySdk.js';
import Task from './tasks/Task.js';

@singleton()
export default class TaskExecutingQueue {
  private readonly queue: Task[] = [];
  private runningTask: Task | null = null;

  private processedTaskCount = 0;
  private erroredTaskCount = 0;

  add(tasks: Task | Task[]): void {
    if (!Array.isArray(tasks)) {
      tasks = [tasks];
    }

    for (const task of tasks) {
      for (const queuedTask of this.queue) {
        if (queuedTask.equals(task)) {
          return;
        }
      }

      this.queue.push(task);
    }

    this.queue.sort((a, b) => a.priority - b.priority);

    this.tickProcessing();
  }

  shutdown(): void {
    this.queue.length = 0;
  }

  getProcessedTaskCount(): number {
    return this.processedTaskCount;
  }

  getErroredTaskCount(): number {
    return this.erroredTaskCount;
  }

  getRunningTaskName(): string | null {
    return this.runningTask?.displayName ?? null;
  }

  getQueuedTaskNames(): string[] {
    return this.queue.map(task => task.displayName);
  }

  private tickProcessing(): void {
    if (this.runningTask != null || this.queue.length === 0) {
      return;
    }

    this.runningTask = this.queue.shift()!;

    this.runningTask.run()
      .catch((err) => {
        ++this.erroredTaskCount;
        SentrySdk.logAndCaptureError(err);
      })
      .finally(() => {
        this.runningTask = null;
        ++this.processedTaskCount;

        this.tickProcessing();
      });
  }
}
