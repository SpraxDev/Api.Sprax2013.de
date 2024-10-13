import { PrismaClient } from '@prisma/client';
import ChildProcess from 'node:child_process';
import { Disposable, singleton } from 'tsyringe';

@singleton()
export default class DatabaseClient extends PrismaClient implements Disposable {
  constructor() {
    super();
  }

  /**
   * (Workaround for https://github.com/prisma/prisma/issues/5598)
   */
  async fetchNow(): Promise<Date> {
    const records = await this.$queryRaw`SELECT now() as now;`;
    if (!Array.isArray(records) || records.length != 1 || !(records[0].now instanceof Date)) {
      throw new Error('Expected array with one Date-record');
    }

    return records[0].now;
  }

  async runDatabaseMigrations(): Promise<void> {
    ChildProcess.execSync('npm run prisma:migrate:deploy', { stdio: 'inherit' });
  }

  async dispose(): Promise<void> {
    await this.$disconnect();
  }
}
