import * as PrismaClient from '@prisma/client';
import { singleton } from 'tsyringe';
import AppConfiguration from '../../config/AppConfiguration.js';
import DatabaseClient from '../../database/DatabaseClient.js';
import ProxyServerConfigurationProvider from '../../net/proxy/ProxyServerConfigurationProvider.js';
import SentrySdk from '../../SentrySdk.js';
import TaskScheduler from '../../task_queue/TaskScheduler.js';
import Arbeitsbeschaffungsmassnahme from './Arbeitsbeschaffungsmassnahme.js';
import ProfileTextureValueProcessor from './payload_processors/ProfileTextureValueProcessor.js';
import SkinImageProcessor from './payload_processors/SkinImageProcessor.js';
import UpdateThirdPartyCapesProcessor from './payload_processors/UpdateThirdPartyCapesProcessor.js';
import UsernameProcessor from './payload_processors/UsernameProcessor.js';
import UuidProcessor from './payload_processors/UuidProcessor.js';

@singleton()
export default class ContinuousQueueWorker {
  private static readonly PAYLOAD_TYPES_TO_PROCESS: PrismaClient.ImportPayloadType[] = [
    'UUID',
    'USERNAME',
    'PROFILE_TEXTURE_VALUE',
    'SKIN_IMAGE',
    'UUID_UPDATE_THIRD_PARTY_CAPES'
  ];

  private tickRunning = false;
  private bufferedTasks: PrismaClient.ImportTask[] = [];
  private nextPayloadTypeIndexToBuffer = 0;

  constructor(
    private readonly taskScheduler: TaskScheduler,
    private readonly databaseClient: DatabaseClient,
    private readonly arbeitsbeschaffungsmassnahme: Arbeitsbeschaffungsmassnahme,
    private readonly profileTextureValueProcessor: ProfileTextureValueProcessor,
    private readonly uuidProcessor: UuidProcessor,
    private readonly usernameProcessor: UsernameProcessor,
    private readonly skinImageProcessor: SkinImageProcessor,
    private readonly updateThirdPartyCapesProcessor: UpdateThirdPartyCapesProcessor,
    private readonly proxyServerConfigurationProvider: ProxyServerConfigurationProvider,
    private readonly appConfiguration: AppConfiguration
  ) {
  }

  async start(): Promise<void> {
    let delay = 2500;
    if (this.appConfiguration.config.workerTickIntervalDynamic) {
      delay = 3000 / Math.max(this.proxyServerConfigurationProvider.getProxyServers().length, 1);
    }

    this.taskScheduler.runRepeating(() => {
      if (this.tickRunning) {
        return;
      }

      this.tickRunning = true;
      this.tick()
        .catch(SentrySdk.logAndCaptureError)
        .finally(() => this.tickRunning = false);
    }, delay);
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
      case 'UUID_UPDATE_THIRD_PARTY_CAPES':
        return this.updateThirdPartyCapesProcessor.process(task);

      default:
        throw new Error(`Unknown payload type: ${task.payloadType}`);
    }
  }

  private async fetchNextTask(): Promise<PrismaClient.ImportTask | null> {
    if (this.bufferedTasks.length === 0) {
      this.bufferedTasks = await this.databaseClient.importTask.findMany({
        where: {
          state: 'QUEUED',
          payloadType: ContinuousQueueWorker.PAYLOAD_TYPES_TO_PROCESS[this.nextPayloadTypeIndexToBuffer]
        },
        orderBy: { createdAt: 'asc' },
        take: 15
      });

      this.nextPayloadTypeIndexToBuffer = (this.nextPayloadTypeIndexToBuffer + 1) % ContinuousQueueWorker.PAYLOAD_TYPES_TO_PROCESS.length;
    }

    return this.bufferedTasks.shift() ?? null;
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
