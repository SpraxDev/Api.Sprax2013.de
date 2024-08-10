import { singleton } from 'tsyringe';
import SetWithTtl from '../../minecraft/SetWithTtl.js';
import Task, { TaskPriority } from './Task.js';

@singleton()
export default class ClearExpiredEntriesInSetsWithTtlTask extends Task {
  private readonly setList: WeakRef<SetWithTtl<any>>[] = [];

  constructor() {
    super('ClearExpiredEntriesInSetsWithTtl', TaskPriority.HIGH);
  }

  async run(): Promise<void> {
    for (let i = this.setList.length - 1; i >= 0; --i) {
      const setRef = this.setList[i];
      const set = setRef.deref();

      if (set == null) {
        this.setList.splice(i, 1);
        continue;
      }
      set.clearExpired();
    }
  }

  equals(other: Task): boolean {
    return other instanceof ClearExpiredEntriesInSetsWithTtlTask;
  }

  registerSet(set: SetWithTtl<any>): void {
    this.setList.push(new WeakRef(set));
  }
}
