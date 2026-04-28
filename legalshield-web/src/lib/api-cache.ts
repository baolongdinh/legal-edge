/**
 * Advanced API Caching Strategy
 * Provides runtime caching with TTL and stale-while-revalidate pattern
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  etag?: string;
}

class APICache {
  private cache = new Map<string, CacheEntry<unknown>>();
  private defaultTTL = 5 * 60 * 1000; // 5 minutes
  private maxEntries = 100;

  /**
   * Get cached data if valid
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    const now = Date.now();
    if (now - entry.timestamp > this.defaultTTL) {
      this.cache.delete(key);
      return null;
    }

    return entry.data as T;
  }

  /**
   * Set cache entry
   */
  set<T>(key: string, data: T, etag?: string): void {
    // Evict oldest if at capacity
    if (this.cache.size >= this.maxEntries) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      etag,
    });
  }

  /**
   * Check if cache has valid entry (stale-while-revalidate)
   */
  has(key: string, staleThreshold = 60000): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    const age = Date.now() - entry.timestamp;
    return age < this.defaultTTL + staleThreshold;
  }

  /**
   * Get stale data for background refresh
   */
  getStale<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    return entry.data as T;
  }

  /**
   * Invalidate specific cache entry
   */
  invalidate(key: string): void {
    this.cache.delete(key);
  }

  /**
   * Invalidate all entries matching pattern
   */
  invalidatePattern(pattern: RegExp): void {
    for (const key of this.cache.keys()) {
      if (pattern.test(key)) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Clear all cache
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache stats
   */
  getStats(): { size: number; maxEntries: number; ttl: number } {
    return {
      size: this.cache.size,
      maxEntries: this.maxEntries,
      ttl: this.defaultTTL,
    };
  }
}

// Global API cache instance
export const apiCache = new APICache();

/**
 * Higher-order function for cached API calls
 * @param key Cache key
 * @param fn API function
 */
export async function withCache<T>(
  key: string,
  fn: () => Promise<T>
): Promise<T> {
  // Try to get fresh cache
  const cached = apiCache.get<T>(key);
  if (cached) {
    return cached;
  }

  // Check for stale data (SWR pattern)
  const stale = apiCache.getStale<T>(key);

  try {
    const data = await fn();
    apiCache.set(key, data);
    return data;
  } catch (error) {
    // Return stale data on error if available
    if (stale) {
      console.warn(`API call failed, returning stale cache for: ${key}`);
      return stale;
    }
    throw error;
  }
}

/**
 * Prefetch data into cache
 */
export function prefetch<T>(key: string, fn: () => Promise<T>): void {
  fn()
    .then((data) => apiCache.set(key, data))
    .catch((err) => console.warn(`Prefetch failed for ${key}:`, err));
}
