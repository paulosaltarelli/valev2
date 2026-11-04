/** Shared by all variable-processing requests in this API process. */
export class LimitedExecutor {
  private active = 0;
  private readonly waiting: Array<() => void> = [];

  constructor(private readonly limit: number) {
    if (!Number.isInteger(limit) || limit < 1) {
      throw new Error('Concurrency must be a positive integer');
    }
  }

  run<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const start = () => {
        this.active++;
        void (async () => {
          try {
            resolve(await task());
          } catch (error) {
            reject(error);
          } finally {
            this.active--;
            this.waiting.shift()?.();
          }
        })();
      };
      if (this.active < this.limit) start();
      else this.waiting.push(start);
    });
  }

  async forEach<T>(items: readonly T[], task: (item: T) => Promise<void>) {
    // Drain in-flight work before the caller can persist, fail or retry a batch.
    const results = await Promise.allSettled(
      items.map((item) => this.run(() => task(item))),
    );
    const failed = results.find(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );
    if (failed) throw failed.reason;
  }
}

export function variableConcurrency(value = process.env.VARIABLE_CONCURRENCY) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 4 ? parsed : 4;
}
