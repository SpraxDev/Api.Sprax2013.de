import * as PrismaClient from '@prisma/client';
import { singleton } from 'tsyringe';
import AppConfiguration from '../../config/AppConfiguration.js';
import DatabaseClient from '../../database/DatabaseClient.js';
import ProxyServerConfigurationProvider from '../../net/proxy/ProxyServerConfigurationProvider.js';
import TaskScheduler from '../../task_queue/TaskScheduler.js';
import SentrySdk from '../../util/SentrySdk.js';
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

  private ticksRunning = 0;
  private bufferedTasks: PrismaClient.ImportTask[] = [];
  private taskBufferSize = 30;
  private inflightBufferedTaskUpdate: Promise<PrismaClient.ImportTask | null> | null = null;
  private nextPayloadTypeIndexToBuffer = 0;
  private ticksProcessedSinceLastReport = 0;

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
    private readonly appConfiguration: AppConfiguration,
  ) {
  }

  async start(): Promise<void> {
    let delay = 2500;
    if (this.appConfiguration.config.workerTickIntervalDynamic) {
      delay = 3000 / Math.max(this.proxyServerConfigurationProvider.getProxyServers().length, 1);
    }
    const averageTicksPerMinute = Math.round(60000 / delay);
    this.taskBufferSize = Math.max(30, Math.min(averageTicksPerMinute / 3, 30));

    let maxConcurrentTicks = 1;
    if (this.appConfiguration.config.workerTickIntervalDynamic) {
      maxConcurrentTicks = this.proxyServerConfigurationProvider.getProxyServers().length;
    }

    this.taskScheduler.runRepeating(() => {
      if (this.ticksRunning >= maxConcurrentTicks) {
        return;
      }

      ++this.ticksRunning;
      this.tick()
        .catch(SentrySdk.logAndCaptureError)
        .finally(() => --this.ticksRunning);
    }, delay);

    this.taskScheduler.runRepeating(() => {
      console.log(`Current worker speed: ${this.ticksProcessedSinceLastReport}/min`);
      this.ticksProcessedSinceLastReport = 0;
    }, 60 * 1000);

    console.log(`Estimating ${averageTicksPerMinute} ticks/minute for the queue worker (delay=${delay}ms)`);
  }

  // TODO: print progress/status-report every minute
  private async tick(): Promise<void> {
    const task = await this.fetchNextTask();
    if (task == null) {
      console.debug('No tasks in the queue, waiting for new tasks...');
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
      SentrySdk.logAndCaptureError(new Error(`Error processing task ${task.id} (${task.payloadType})`, { cause: err }));
      await this.updateTaskStatus(task, 'ERROR');
    }

    ++this.ticksProcessedSinceLastReport;
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
    if (this.inflightBufferedTaskUpdate != null) {
      return await this.inflightBufferedTaskUpdate;
    }

    try {
      const updatePromise = this._fetchNextTask();
      this.inflightBufferedTaskUpdate = updatePromise;
      return await updatePromise;
    } finally {
      this.inflightBufferedTaskUpdate = null;
    }
  }

  private async _fetchNextTask(): Promise<PrismaClient.ImportTask | null> {
    if (this.bufferedTasks.length === 0) {
      this.bufferedTasks = await this.databaseClient.importTask.findMany({
        where: {
          state: 'QUEUED',
          payloadType: ContinuousQueueWorker.PAYLOAD_TYPES_TO_PROCESS[this.nextPayloadTypeIndexToBuffer],
        },
        orderBy: { createdAt: 'asc' },
        take: this.taskBufferSize,
      });

      this.nextPayloadTypeIndexToBuffer = (this.nextPayloadTypeIndexToBuffer + 1) % ContinuousQueueWorker.PAYLOAD_TYPES_TO_PROCESS.length;
    }

    return this.bufferedTasks.shift() ?? null;
  }

  private async updateTaskStatus(task: PrismaClient.ImportTask, state: 'IMPORTED' | 'NO_CHANGES' | 'ERROR'): Promise<void> {
    await this.databaseClient.$transaction(async (transaction) => {
      await transaction.importTask.update({
        where: { id: task.id },
        data: { state },
        select: { id: true },
      });

      if (task.importGroupId != null) {
        let importGroupUpdateData: PrismaClient.Prisma.ImportGroupUpdateInput = { succeededImports: { increment: 1 } };
        if (state === 'ERROR') {
          importGroupUpdateData = { erroredImports: { increment: 1 } };
        }
        if (state === 'NO_CHANGES') {
          importGroupUpdateData = { duplicateImports: { increment: 1 } };
        }

        await transaction.importGroup.update({
          where: { id: task.importGroupId },
          data: importGroupUpdateData,
          select: { id: true },
        });
      }
    });
  }

  private async fetchUsernameTasksBulk(): Promise<PrismaClient.ImportTask[]> {
    return this.databaseClient.importTask.findMany({
      where: {
        payloadType: 'USERNAME',
        state: 'QUEUED',
      },
      take: 10,
    });
  }
}
