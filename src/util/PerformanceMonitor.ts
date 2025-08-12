/**
 * Performance monitoring utility to track the impact of optimizations
 */
export class PerformanceMonitor {
  private static readonly metrics = new Map<string, {
    count: number;
    totalTime: number;
    minTime: number;
    maxTime: number;
    lastUpdated: number;
  }>();

  private static readonly REQUEST_DEDUPE_HITS = 'request_deduplication_hits';
  private static readonly MEMORY_CACHE_HITS = 'memory_cache_hits';
  private static readonly MEMORY_CACHE_MISSES = 'memory_cache_misses';
  private static readonly BATCH_UPDATES_SAVED = 'batch_updates_saved';
  private static readonly HTTP_RETRIES_AVOIDED = 'http_retries_avoided';

  /**
   * Record a performance metric
   */
  static recordMetric(name: string, value: number = 1): void {
    const existing = this.metrics.get(name) || {
      count: 0,
      totalTime: 0,
      minTime: Infinity,
      maxTime: -Infinity,
      lastUpdated: Date.now(),
    };

    existing.count += 1;
    existing.totalTime += value;
    existing.minTime = Math.min(existing.minTime, value);
    existing.maxTime = Math.max(existing.maxTime, value);
    existing.lastUpdated = Date.now();

    this.metrics.set(name, existing);
  }

  /**
   * Record timing for an operation
   */
  static async recordTiming<T>(name: string, operation: () => Promise<T>): Promise<T> {
    const start = performance.now();
    try {
      const result = await operation();
      const duration = performance.now() - start;
      this.recordMetric(name, duration);
      return result;
    } catch (error) {
      const duration = performance.now() - start;
      this.recordMetric(`${name}_error`, duration);
      throw error;
    }
  }

  /**
   * Record a cache hit
   */
  static recordCacheHit(cacheType: 'memory' | 'request_dedup'): void {
    if (cacheType === 'memory') {
      this.recordMetric(this.MEMORY_CACHE_HITS);
    } else if (cacheType === 'request_dedup') {
      this.recordMetric(this.REQUEST_DEDUPE_HITS);
    }
  }

  /**
   * Record a cache miss
   */
  static recordCacheMiss(cacheType: 'memory'): void {
    if (cacheType === 'memory') {
      this.recordMetric(this.MEMORY_CACHE_MISSES);
    }
  }

  /**
   * Record database operations saved by batching
   */
  static recordBatchSavings(operationsSaved: number): void {
    this.recordMetric(this.BATCH_UPDATES_SAVED, operationsSaved);
  }

  /**
   * Record HTTP retries avoided by backoff
   */
  static recordRetryAvoidance(): void {
    this.recordMetric(this.HTTP_RETRIES_AVOIDED);
  }

  /**
   * Get current performance statistics
   */
  static getStats(): Record<string, any> {
    const stats: Record<string, any> = {};
    
    // Convert Map to array to avoid iteration issues
    const entries = Array.from(this.metrics.entries());
    for (const [name, metric] of entries) {
      stats[name] = {
        count: metric.count,
        total: metric.totalTime,
        average: metric.count > 0 ? metric.totalTime / metric.count : 0,
        min: metric.minTime === Infinity ? 0 : metric.minTime,
        max: metric.maxTime === -Infinity ? 0 : metric.maxTime,
        lastUpdated: new Date(metric.lastUpdated).toISOString(),
      };
    }

    // Calculate cache hit ratios
    const memoryCacheHits = this.metrics.get(this.MEMORY_CACHE_HITS)?.count || 0;
    const memoryCacheMisses = this.metrics.get(this.MEMORY_CACHE_MISSES)?.count || 0;
    const totalMemoryRequests = memoryCacheHits + memoryCacheMisses;
    
    stats.cache_hit_ratios = {
      memory_cache: totalMemoryRequests > 0 ? (memoryCacheHits / totalMemoryRequests * 100).toFixed(2) + '%' : 'N/A',
    };

    return stats;
  }

  /**
   * Reset all performance metrics
   */
  static reset(): void {
    this.metrics.clear();
  }

  /**
   * Get a summary of performance improvements
   */
  static getSummary(): string {
    const stats = this.getStats();
    const lines = [
      'Performance Monitoring Summary:',
      '================================',
    ];

    if (stats[this.REQUEST_DEDUPE_HITS]?.count > 0) {
      lines.push(`Request Deduplication: ${stats[this.REQUEST_DEDUPE_HITS].count} duplicate requests avoided`);
    }

    if (stats.cache_hit_ratios?.memory_cache !== 'N/A') {
      lines.push(`Memory Cache Hit Ratio: ${stats.cache_hit_ratios.memory_cache}`);
    }

    if (stats[this.BATCH_UPDATES_SAVED]?.total > 0) {
      lines.push(`Database Operations Saved: ${stats[this.BATCH_UPDATES_SAVED].total} through batching`);
    }

    if (stats[this.HTTP_RETRIES_AVOIDED]?.count > 0) {
      lines.push(`HTTP Retries Avoided: ${stats[this.HTTP_RETRIES_AVOIDED].count} through exponential backoff`);
    }

    return lines.join('\n');
  }
}