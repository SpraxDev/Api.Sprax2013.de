import { container } from 'tsyringe';
import ClearExpiredEntriesInSetsWithTtlTask from '../task_queue/tasks/ClearExpiredEntriesInSetsWithTtlTask.js';

export default class SetWithTtl<T> {
  private readonly values = new Map<T, number>();
  private readonly ttlInMilliseconds: number;

  private constructor(ttlInSeconds: number) {
    this.ttlInMilliseconds = ttlInSeconds * 1000;
  }

  add(key: T): void {
    this.values.set(key, Date.now() + this.ttlInMilliseconds);
  }

  has(key: T): boolean {
    const expiration = this.values.get(key);
    return expiration != null && !this.isExpired(expiration);
  }

  getAgeInSeconds(key: T): number {
    const expiration = this.values.get(key);
    if (expiration == null || this.isExpired(expiration)) {
      return 0;
    }

    const creationTime = expiration - this.ttlInMilliseconds;
    return Math.floor((Date.now() - creationTime) / 1000);
  }

  clear(): void {
    this.values.clear();
  }

  clearExpired(): void {
    for (const [value, expiration] of this.values.entries()) {
      if (this.isExpired(expiration)) {
        this.values.delete(value);
      }
    }
  }

  private isExpired(expiration: number): boolean {
    return expiration < Date.now();
  }

  static create<T>(ttlInSeconds: number): SetWithTtl<T> {
    const setWithTTL = new SetWithTtl<T>(ttlInSeconds);
    container.resolve(ClearExpiredEntriesInSetsWithTtlTask).registerSet(setWithTTL);
    return setWithTTL;
  }
}
