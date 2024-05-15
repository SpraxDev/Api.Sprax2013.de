export default class SetWithTTL<T> {
  private readonly values = new Map<T, number>();
  private readonly ttlInMilliseconds: number;

  private readonly interval: NodeJS.Timeout;

  constructor(ttlInSeconds: number) {
    this.ttlInMilliseconds = ttlInSeconds * 1000;
    this.interval = setInterval(() => this.clearExpired(), this.ttlInMilliseconds);
  }

  destroy(): void {
    clearInterval(this.interval);
  }

  add(key: T): void {
    this.values.set(key, Date.now() + this.ttlInMilliseconds);
  }

  has(key: T): boolean {
    const expiration = this.values.get(key);
    return expiration != null && !this.isExpired(expiration);
  }

  clear(): void {
    this.values.clear();
  }

  private clearExpired(): void {
    const now = Date.now();
    for (const [value, expiration] of this.values.entries()) {
      if (this.isExpired(expiration)) {
        this.values.delete(value);
      }
    }
  }

  private isExpired(expiration: number): boolean {
    return expiration < Date.now();
  }
}
