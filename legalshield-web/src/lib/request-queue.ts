/**
 * Request Queue with Rate Limiting
 * Prevents API overload by limiting concurrent requests
 */

interface QueuedRequest<T> {
  fn: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
  priority: number;
}

class RequestQueue {
  private queue: QueuedRequest<unknown>[] = [];
  private active = 0;
  private maxConcurrent: number;

  constructor(maxConcurrent = 5) {
    this.maxConcurrent = maxConcurrent;
  }

  /**
   * Add a request to the queue
   * @param fn Function that returns a promise
   * @param priority Higher priority requests are processed first (default: 0)
   * @returns Promise that resolves when the request is processed
   */
  async add<T>(fn: () => Promise<T>, priority = 0): Promise<T> {
    return new Promise((resolve, reject) => {
      const request: QueuedRequest<T> = {
        fn,
        resolve,
        reject,
        priority,
      };

      // Add to queue and sort by priority (higher first)
      this.queue.push(request as QueuedRequest<unknown>);
      this.queue.sort((a, b) => b.priority - a.priority);

      // Try to process next request
      this.processNext();
    });
  }

  /**
   * Process the next request in the queue
   */
  private processNext(): void {
    if (this.active >= this.maxConcurrent || this.queue.length === 0) {
      return;
    }

    const request = this.queue.shift();
    if (!request) return;

    this.active++;

    request
      .fn()
      .then((result) => {
        request.resolve(result);
      })
      .catch((error) => {
        request.reject(error);
      })
      .finally(() => {
        this.active--;
        // Process next request
        this.processNext();
      });
  }

  /**
   * Get the current queue size
   */
  getQueueSize(): number {
    return this.queue.length;
  }

  /**
   * Get the number of active requests
   */
  getActiveCount(): number {
    return this.active;
  }

  /**
   * Clear all pending requests from the queue
   */
  clear(): void {
    // Reject all pending requests
    this.queue.forEach((request) => {
      request.reject(new Error('Request queue cleared'));
    });
    this.queue = [];
  }

  /**
   * Update the max concurrent limit
   */
  setMaxConcurrent(max: number): void {
    this.maxConcurrent = max;
    // Try to process more requests if limit increased
    this.processNext();
  }
}

// Global request queue instance
export const requestQueue = new RequestQueue(5);

/**
 * Higher-order function to wrap API calls with queue
 * @param fn The API function to wrap
 * @param priority Priority of the request (higher = processed sooner)
 */
export function withQueue<T>(
  fn: () => Promise<T>,
  priority = 0
): Promise<T> {
  return requestQueue.add(fn, priority);
}
