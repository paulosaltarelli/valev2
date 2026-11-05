import { RmRequestGate } from './rm-request-gate';

describe('RmRequestGate', () => {
  beforeEach(() => jest.useFakeTimers({ now: 0 }));
  afterEach(() => jest.useRealTimers());

  it('spaces concurrent request starts at 120 per minute', async () => {
    const gate = new RmRequestGate(120);
    const starts: number[] = [];
    const requests = Array.from({ length: 4 }, () => gate.run(async () => {
      starts.push(Date.now());
    }));
    await jest.advanceTimersByTimeAsync(1500);
    await Promise.all(requests);
    expect(starts).toEqual([0, 500, 1000, 1500]);
  });

  it('extends the wait of requests already queued when RM returns 429', async () => {
    const gate = new RmRequestGate(120);
    const next = jest.fn(async () => Date.now());
    await gate.run(async () => {});
    const waiting = gate.run(next);
    await jest.advanceTimersByTimeAsync(100);
    gate.defer('2');
    await jest.advanceTimersByTimeAsync(1999);
    expect(next).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);
    await expect(waiting).resolves.toBe(2100);
  });

  it('honors HTTP dates and uses one minute without Retry-After', () => {
    const gate = new RmRequestGate(120);
    expect(gate.defer(new Date(10_000).toUTCString())).toBe(10_000);
    expect(gate.defer(undefined)).toBe(60_000);
  });
});
