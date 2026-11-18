import { LimitedExecutor } from '../utils/limited-executor';

export class RmRequestGate {
  private readonly slots = new LimitedExecutor(4);
  private admission = Promise.resolve();
  private nextStart = 0;
  private blockedUntil = 0;
  private readonly intervalMs: number;

  constructor(requestsPerMinute = Number(process.env.RM_REQUESTS_PER_MINUTE)) {
    const limit = Number.isSafeInteger(requestsPerMinute) && requestsPerMinute > 0
      ? requestsPerMinute
      : 120;
    this.intervalMs = Math.ceil(60_000 / limit);
  }

  run<T>(request: () => Promise<T>): Promise<T> {
    return this.slots.run(async () => {
      const start = this.admission.then(async () => {
        for (;;) {
          const wait = Math.max(this.nextStart, this.blockedUntil) - Date.now();
          if (wait <= 0) break;
          await new Promise<void>((resolve) => {
            setTimeout(resolve, Math.min(wait, 2_147_483_647));
          });
        }
        this.nextStart = Date.now() + this.intervalMs;
        return { response: request() };
      });
      this.admission = start.then(() => {}, () => {});
      return (await start).response;
    });
  }

  defer(retryAfter: unknown) {
    const now = Date.now();
    const value = typeof retryAfter === 'string' || typeof retryAfter === 'number'
      ? String(retryAfter).trim()
      : '';
    const until = /^\d+$/.test(value)
      ? now + Number(value) * 1000
      : Date.parse(value);
    const deadline = Number.isFinite(until) ? Math.max(now, until) : now + 60_000;
    this.blockedUntil = Math.max(this.blockedUntil, deadline);
    return deadline - now;
  }

  get retryNotBefore() {
    return this.blockedUntil;
  }
}
