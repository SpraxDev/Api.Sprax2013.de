import { container } from 'tsyringe';
import { vitest } from 'vitest';
import SetWithTtl from '../../../src/minecraft/SetWithTtl.js';
import ClearExpiredEntriesInMapsWithTtlTask
  from '../../../src/task_queue/tasks/ClearExpiredEntriesInMapsWithTtlTask.js';
import MapWithTtl from '../../../src/util/MapWithTtl.js';

vitest.useFakeTimers();
vitest.setSystemTime(new Date('2024-01-01'));

describe('SetWithTtl', () => {
  let setWithTtl: SetWithTtl<string>;
  beforeEach(() => {
    const clearExpiredEntriesInMapsWithTtlTaskResolveSpy = vitest.fn();
    const containerResolveSpy = vitest.spyOn(container, 'resolve').mockReturnValue({
      registerSet: clearExpiredEntriesInMapsWithTtlTaskResolveSpy,
    });

    setWithTtl = new SetWithTtl(5);

    expect(containerResolveSpy).toHaveBeenCalledTimes(1);
    expect(containerResolveSpy).toHaveBeenCalledWith(ClearExpiredEntriesInMapsWithTtlTask);
    expect(clearExpiredEntriesInMapsWithTtlTaskResolveSpy).toHaveBeenCalledTimes(1);
    expect(clearExpiredEntriesInMapsWithTtlTaskResolveSpy).toHaveBeenCalledWith(expect.any(MapWithTtl));
  });

  test('Adding a value, makes #has return true for it', () => {
    expect(setWithTtl.has('a')).toBe(false);
    setWithTtl.add('a');
    expect(setWithTtl.has('a')).toBe(true);
  });

  test('#has returns false for a value that has expired', () => {
    setWithTtl.add('a');
    vitest.advanceTimersByTime(5001);

    expect(setWithTtl.has('a')).toBe(false);
  });

  test('#getAgeInSeconds returns age of 0 for non-existing keys', () => {
    expect(setWithTtl.getAgeInSeconds('a')).toBe(0);
  });

  test('#getAgeInSeconds returns age of 0 for expired key', () => {
    setWithTtl.add('a');
    vitest.advanceTimersByTime(5001);

    expect(setWithTtl.has('a')).toBe(false);
    expect(setWithTtl.getAgeInSeconds('a')).toBe(0);
  });

  test('#getAgeInSeconds returns the age of the value in seconds', () => {
    setWithTtl.add('a');

    expect(setWithTtl.getAgeInSeconds('a')).toBe(0);
    vitest.advanceTimersByTime(2000);
    expect(setWithTtl.getAgeInSeconds('a')).toBe(2);
  });

  test('#clear removes all values', () => {
    setWithTtl.add('a');
    setWithTtl.add('b');

    expect(setWithTtl.has('a')).toBe(true);
    expect(setWithTtl.has('b')).toBe(true);

    setWithTtl.clear();

    expect(setWithTtl.has('a')).toBe(false);
    expect(setWithTtl.has('b')).toBe(false);
  });

  test('#clearExpired removes all expired values', () => {
    setWithTtl.add('a');
    vitest.advanceTimersByTime(2500);
    setWithTtl.add('b');

    vitest.advanceTimersByTime(5000);
    setWithTtl.clearExpired();

    expect(setWithTtl.has('a')).toBe(false);
    expect(setWithTtl.has('b')).toBe(true);
  });
});
