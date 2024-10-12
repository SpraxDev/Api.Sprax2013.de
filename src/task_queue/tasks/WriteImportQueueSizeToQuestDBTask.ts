import { singleton } from 'tsyringe';
import DatabaseClient from '../../database/DatabaseClient.js';
import QuestDbClient from '../../database/QuestDbClient.js';
import Task, { TaskPriority } from './Task.js';

@singleton()
export default class WriteImportQueueSizeToQuestDBTask extends Task {
  constructor(
    private readonly databaseClient: DatabaseClient,
    private readonly questDbClient: QuestDbClient
  ) {
    super('WriteImportQueueSizeToQuestDB', TaskPriority.NORMAL);
  }

  async run(): Promise<void> {
    const importQueueSize = await this.databaseClient.importTask.count({ where: { state: 'QUEUED' } });
    const importErroredImports = await this.databaseClient.importTask.count({ where: { state: 'ERROR' } });
    await this.questDbClient.pushImportQueueSize(importQueueSize, importErroredImports);
  }

  equals(other: Task): boolean {
    return other instanceof WriteImportQueueSizeToQuestDBTask;
  }
}
