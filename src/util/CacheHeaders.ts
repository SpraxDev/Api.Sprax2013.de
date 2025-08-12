/**
 * Utility for generating adaptive cache headers based on data age and freshness
 */
export default class CacheHeaders {
  /**
   * Calculate adaptive cache times based on data age
   * @param ageInSeconds How old the data is
   * @param maxAge Maximum cache age in seconds
   * @param minAge Minimum cache age in seconds
   * @returns Object with maxAge and remaining cache time
   */
  static calculateAdaptiveCacheTime(ageInSeconds: number, maxAge: number = 300, minAge: number = 30): { maxAge: number; remaining: number } {
    // For fresh data (< 60 seconds old), use full cache time
    if (ageInSeconds < 60) {
      return { maxAge, remaining: maxAge };
    }
    
    // For older data, reduce cache time proportionally
    const remaining = Math.max(minAge, maxAge - ageInSeconds);
    return { maxAge, remaining };
  }

  /**
   * Generate cache headers for profile-like data that changes infrequently
   * @param ageInSeconds Age of the data in seconds
   * @returns Cache-Control header value
   */
  static generateProfileCacheHeaders(ageInSeconds: number): string {
    const { remaining } = CacheHeaders.calculateAdaptiveCacheTime(ageInSeconds, 300, 60);
    return `public, max-age=${remaining}, s-maxage=${remaining}`;
  }

  /**
   * Generate cache headers for frequently changing data like server status
   * @param ageInSeconds Age of the data in seconds
   * @returns Cache-Control header value
   */
  static generateServerStatusCacheHeaders(ageInSeconds: number): string {
    const { remaining } = CacheHeaders.calculateAdaptiveCacheTime(ageInSeconds, 60, 10);
    return `public, max-age=${remaining}, s-maxage=${remaining}`;
  }

  /**
   * Generate cache headers for static-like data such as blocklists
   * @param ageInSeconds Age of the data in seconds
   * @returns Cache-Control header value
   */
  static generateStaticDataCacheHeaders(ageInSeconds: number = 0): string {
    const { remaining } = CacheHeaders.calculateAdaptiveCacheTime(ageInSeconds, 600, 120);
    return `public, max-age=${remaining}, s-maxage=${remaining}`;
  }

  /**
   * Generate cache headers for image content
   * @param ageInSeconds Age of the data in seconds
   * @returns Cache-Control header value
   */
  static generateImageCacheHeaders(ageInSeconds: number = 0): string {
    const { remaining } = CacheHeaders.calculateAdaptiveCacheTime(ageInSeconds, 3600, 300);
    return `public, max-age=${remaining}, s-maxage=${remaining}`;
  }
}