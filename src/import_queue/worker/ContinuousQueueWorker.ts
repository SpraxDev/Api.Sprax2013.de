import * as PrismaClient from '@prisma/client';
import { singleton } from 'tsyringe';
import DatabaseClient from '../../database/DatabaseClient.js';
import SentrySdk from '../../SentrySdk.js';
import TaskScheduler from '../../task_queue/TaskScheduler.js';
import Arbeitsbeschaffungsmassnahme from './Arbeitsbeschaffungsmassnahme.js';
import ProfileTextureValueProcessor from './payload_processors/ProfileTextureValueProcessor.js';
import SkinImageProcessor from './payload_processors/SkinImageProcessor.js';
import UsernameProcessor from './payload_processors/UsernameProcessor.js';
import UuidProcessor from './payload_processors/UuidProcessor.js';

@singleton()
export default class ContinuousQueueWorker {
  private tickRunning = false;

  constructor(
    private readonly taskScheduler: TaskScheduler,
    private readonly databaseClient: DatabaseClient,
    private readonly arbeitsbeschaffungsmassnahme: Arbeitsbeschaffungsmassnahme,
    private readonly profileTextureValueProcessor: ProfileTextureValueProcessor,
    private readonly uuidProcessor: UuidProcessor,
    private readonly usernameProcessor: UsernameProcessor,
    private readonly skinImageProcessor: SkinImageProcessor
  ) {
  }

  async start(): Promise<void> {
    this.taskScheduler.runRepeating(() => {
      if (this.tickRunning) {
        return;
      }

      this.tickRunning = true;
      this.tick()
        .catch(SentrySdk.logAndCaptureError)
        .finally(() => this.tickRunning = false);
    }, 2500);
  }

  private async tick(): Promise<void> {
    const task = await this.fetchNextTask();
    if (task == null) {
      await this.tickForEmptyQueue();
      return;
    }

    try {
      if (task.payloadType === 'USERNAME') {
        const usernameTasks = await this.fetchUsernameTasksBulk();
        if (usernameTasks.length > 1) {
          const bulkResults = await this.usernameProcessor.processBulk(usernameTasks);
          for (const result of bulkResults) {
            if (typeof result.result === 'boolean') {
              await this.updateTaskStatus(result.task, result.result ? 'IMPORTED' : 'NO_CHANGES');
            } else {
              SentrySdk.logAndCaptureError(result.result);
              await this.updateTaskStatus(result.task, 'ERROR');
            }
          }
          return;
        }
      }

      const taskWasDuplicate = await this.processTask(task);
      await this.updateTaskStatus(task, taskWasDuplicate ? 'IMPORTED' : 'NO_CHANGES');
    } catch (err: any) {
      SentrySdk.logAndCaptureError(err);
      await this.updateTaskStatus(task, 'ERROR');
    }
  }

  private async tickForEmptyQueue(): Promise<void> {
    const uuidToUpdate = await this.arbeitsbeschaffungsmassnahme.nextUuidToUpdate();
    if (uuidToUpdate != null) {
      await this.uuidProcessor.process(uuidToUpdate);
    }
  }

  private async processTask(task: PrismaClient.ImportTask): Promise<boolean> {
    switch (task.payloadType) {
      case 'PROFILE_TEXTURE_VALUE':
        return this.profileTextureValueProcessor.process(task);
      case 'UUID':
        return this.uuidProcessor.process(task);
      case 'USERNAME':
        return this.usernameProcessor.process(task);
      case 'SKIN_IMAGE':
        return this.skinImageProcessor.process(task);

      default:
        throw new Error(`Unknown payload type: ${task.payloadType}`);
    }
  }

  private async fetchNextTask(): Promise<PrismaClient.ImportTask | null> {
    return this.databaseClient.importTask.findFirst({ where: { state: 'QUEUED' } });
  }

  private async updateTaskStatus(task: PrismaClient.ImportTask, state: 'IMPORTED' | 'NO_CHANGES' | 'ERROR'): Promise<void> {
    await this.databaseClient.importTask.update({
      where: { id: task.id },
      data: { state }
    });
  }

  private async fetchUsernameTasksBulk(): Promise<PrismaClient.ImportTask[]> {
    return this.databaseClient.importTask.findMany({
      where: {
        payloadType: 'USERNAME',
        state: 'QUEUED'
      },
      take: 10
    });
  }
}
