import MapWithTtl from '../util/MapWithTtl.js';

export default class SetWithTtl<T> {
  private readonly values: MapWithTtl<T, null>;

  constructor(ttlInSeconds: number) {
    this.values = MapWithTtl.create(ttlInSeconds);
  }

  add(key: T): void {
    this.values.set(key, null);
  }

  has(key: T): boolean {
    return this.values.has(key);
  }

  getAgeInSeconds(key: T): number {
    return this.values.getAgeInSeconds(key);
  }

  clear(): void {
    this.values.clear();
  }

  clearExpired(): void {
    this.values.clearExpired();
  }
}
