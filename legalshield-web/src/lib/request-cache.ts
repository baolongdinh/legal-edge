/**
 * Request Deduplication Cache
 * Prevents duplicate API calls for the same resource
 */

interface CachedRequest<T> {
  promise: Promise<T>;
  timestamp: number;
}

const pendingRequests = new Map<string, CachedRequest<unknown>>();

// Cache TTL in milliseconds (5 seconds)
const CACHE_TTL = 5000;

/**
 * Deduplicate concurrent requests for the same resource
 * @param key Unique key for the request
 * @param fn Function that returns a promise
 * @returns The result of the function
 */
export async function dedupeRequest<T>(
  key: string,
  fn: () => Promise<T>
): Promise<T> {
  // Check if there's already a pending request
  const cached = pendingRequests.get(key);

  if (cached) {
    // Check if cache is still valid
    const now = Date.now();
    if (now - cached.timestamp < CACHE_TTL) {
      return cached.promise as Promise<T>;
    }
    // Cache expired, remove it
    pendingRequests.delete(key);
  }

  // Create new request
  const promise = fn().finally(() => {
    // Remove from cache after completion (with delay to prevent race conditions)
    setTimeout(() => {
      pendingRequests.delete(key);
    }, 100);
  });

  // Store in cache
  pendingRequests.set(key, {
    promise,
    timestamp: Date.now(),
  });

  return promise;
}

/**
 * Clear all pending requests from cache
 */
export function clearRequestCache(): void {
  pendingRequests.clear();
}

/**
 * Remove a specific request from cache
 */
export function removeFromCache(key: string): void {
  pendingRequests.delete(key);
}

/**
 * Get the number of pending requests in cache
 */
export function getCacheSize(): number {
  return pendingRequests.size;
}
