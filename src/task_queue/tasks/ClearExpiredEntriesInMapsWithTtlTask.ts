import { singleton } from 'tsyringe';
import MapWithTtl from '../../util/MapWithTtl.js';
import Task, { TaskPriority } from './Task.js';

@singleton()
export default class ClearExpiredEntriesInMapsWithTtlTask extends Task {
  private readonly mapList: WeakRef<MapWithTtl<any, any>>[] = [];

  constructor() {
    super('ClearExpiredEntriesInMapsWithTtl', TaskPriority.HIGH);
  }

  async run(): Promise<void> {
    for (let i = this.mapList.length - 1; i >= 0; --i) {
      const mapRef = this.mapList[i];
      const map = mapRef.deref();

      if (map == null) {
        this.mapList.splice(i, 1);
        continue;
      }
      map.clearExpired();
    }
  }

  equals(other: Task): boolean {
    return other instanceof ClearExpiredEntriesInMapsWithTtlTask;
  }

  registerSet(map: MapWithTtl<any, any>): void {
    this.mapList.push(new WeakRef(map));
  }
}
