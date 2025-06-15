import { container } from 'tsyringe';
import ClearExpiredEntriesInMapsWithTtlTask from '../task_queue/tasks/ClearExpiredEntriesInMapsWithTtlTask.js';

export default class MapWithTtl<K, V> {
  private readonly values = new Map<K, { value: V, expiration: number }>();
  private readonly ttlInMilliseconds: number;

  private constructor(ttlInSeconds: number) {
    this.ttlInMilliseconds = ttlInSeconds * 1000;
  }

  set(key: K, value: V): void {
    this.values.set(key, { value, expiration: Date.now() + this.ttlInMilliseconds });
  }

  has(key: K): boolean {
    const storedItem = this.values.get(key);
    return storedItem != null && !this.isExpired(storedItem.expiration);
  }

  get(key: K): V | null {
    const storedItem = this.values.get(key);
    if (storedItem == null || this.isExpired(storedItem.expiration)) {
      return null;
    }
    return storedItem.value;
  }

  getAgeInSeconds(key: K): number {
    const storedItem = this.values.get(key);
    if (storedItem == null || this.isExpired(storedItem.expiration)) {
      return 0;
    }

    const creationTime = storedItem.expiration - this.ttlInMilliseconds;
    return Math.floor((Date.now() - creationTime) / 1000);
  }

  clear(): void {
    this.values.clear();
  }

  clearExpired(): void {
    for (const [value, expiration] of this.values.entries()) {
      if (this.isExpired(expiration.expiration)) {
        this.values.delete(value);
      }
    }
  }

  private isExpired(expiration: number): boolean {
    return expiration < Date.now();
  }

  static create<K, V>(ttlInSeconds: number): MapWithTtl<K, V> {
    const mapWithTtl = new MapWithTtl<K, V>(ttlInSeconds);
    container.resolve(ClearExpiredEntriesInMapsWithTtlTask).registerSet(mapWithTtl);
    return mapWithTtl;
  }
}
