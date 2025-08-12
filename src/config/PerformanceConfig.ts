/**
 * Performance configuration options for the API
 */
export interface PerformanceConfig {
  // HTTP Client settings
  enableRequestDeduplication: boolean;
  httpRetryMaxAttempts: number;
  httpRetryBaseDelay: number;
  
  // Caching settings
  enableMemoryCache: boolean;
  memoryCacheTtl: number;
  memoryCacheMaxSize: number;
  
  // Queue processing settings
  enableBatchedStatusUpdates: boolean;
  statusUpdateBatchSize: number;
  statusUpdateBatchTimeout: number;
  
  // Image processing settings
  enableOptimizedImageOps: boolean;
  smallImageThreshold: number;
  
  // Server settings
  enableEtagSupport: boolean;
  enableAdaptiveCaching: boolean;
}

export const DEFAULT_PERFORMANCE_CONFIG: PerformanceConfig = {
  // HTTP Client settings
  enableRequestDeduplication: true,
  httpRetryMaxAttempts: 2,
  httpRetryBaseDelay: 1000,
  
  // Caching settings
  enableMemoryCache: true,
  memoryCacheTtl: 5 * 60 * 1000, // 5 minutes
  memoryCacheMaxSize: 100,
  
  // Queue processing settings
  enableBatchedStatusUpdates: true,
  statusUpdateBatchSize: 10,
  statusUpdateBatchTimeout: 100,
  
  // Image processing settings
  enableOptimizedImageOps: true,
  smallImageThreshold: 8, // 8x8 pixels
  
  // Server settings
  enableEtagSupport: true,
  enableAdaptiveCaching: true,
};

/**
 * Get performance configuration from environment variables or defaults
 */
export function getPerformanceConfig(): PerformanceConfig {
  return {
    enableRequestDeduplication: process.env.PERF_ENABLE_REQUEST_DEDUP !== 'false',
    httpRetryMaxAttempts: parseInt(process.env.PERF_HTTP_RETRY_MAX_ATTEMPTS || '2'),
    httpRetryBaseDelay: parseInt(process.env.PERF_HTTP_RETRY_BASE_DELAY || '1000'),
    
    enableMemoryCache: process.env.PERF_ENABLE_MEMORY_CACHE !== 'false',
    memoryCacheTtl: parseInt(process.env.PERF_MEMORY_CACHE_TTL || '300000'),
    memoryCacheMaxSize: parseInt(process.env.PERF_MEMORY_CACHE_MAX_SIZE || '100'),
    
    enableBatchedStatusUpdates: process.env.PERF_ENABLE_BATCHED_UPDATES !== 'false',
    statusUpdateBatchSize: parseInt(process.env.PERF_STATUS_UPDATE_BATCH_SIZE || '10'),
    statusUpdateBatchTimeout: parseInt(process.env.PERF_STATUS_UPDATE_BATCH_TIMEOUT || '100'),
    
    enableOptimizedImageOps: process.env.PERF_ENABLE_OPTIMIZED_IMAGE_OPS !== 'false',
    smallImageThreshold: parseInt(process.env.PERF_SMALL_IMAGE_THRESHOLD || '8'),
    
    enableEtagSupport: process.env.PERF_ENABLE_ETAG_SUPPORT !== 'false',
    enableAdaptiveCaching: process.env.PERF_ENABLE_ADAPTIVE_CACHING !== 'false',
  };
}