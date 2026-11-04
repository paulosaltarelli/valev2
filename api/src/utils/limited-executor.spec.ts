import { LimitedExecutor, variableConcurrency } from './limited-executor';

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

describe('LimitedExecutor', () => {
  it('shares four slots between simultaneous requests and drains all work', async () => {
    const executor = new LimitedExecutor(4);
    let active = 0;
    let peak = 0;
    const completed: number[] = [];
    const task = async (id: number) => {
      active++;
      peak = Math.max(peak, active);
      await tick();
      completed.push(id);
      active--;
    };
    await Promise.all([
      executor.forEach([1, 2, 3, 4, 5, 6], task),
      executor.forEach([7, 8, 9, 10], task),
    ]);
    expect(peak).toBe(4);
    expect(active).toBe(0);
    expect(completed.sort((a, b) => a - b)).toEqual([1,2,3,4,5,6,7,8,9,10]);
  });

  it('waits for other employees before reporting failure and releases slots', async () => {
    const executor = new LimitedExecutor(4);
    const completed: number[] = [];
    await expect(executor.forEach([1, 2, 3, 4, 5], async (id) => {
      if (id === 1) throw new Error('employee failed');
      await tick();
      completed.push(id);
    })).rejects.toThrow('employee failed');
    expect(completed.sort()).toEqual([2, 3, 4, 5]);
    await expect(executor.run(async () => 'recovered')).resolves.toBe('recovered');
  });

  it('allows serial rollback and bounds configuration at four', () => {
    expect(variableConcurrency('1')).toBe(1);
    expect(variableConcurrency('4')).toBe(4);
    for (const value of ['', '0', '-1', '5', '2.5', 'invalid']) {
      expect(variableConcurrency(value)).toBe(4);
    }
  });
});
