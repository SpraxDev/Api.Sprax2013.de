import { container } from 'tsyringe';
import { vitest } from 'vitest';
import ClearExpiredEntriesInMapsWithTtlTask
  from '../../../src/task_queue/tasks/ClearExpiredEntriesInMapsWithTtlTask.js';
import MapWithTtl from '../../../src/util/MapWithTtl.js';

vitest.useFakeTimers();
vitest.setSystemTime(new Date('2024-01-01'));

describe('MapWithTtl', () => {
  let mapWithTtl: MapWithTtl<string, number>;
  beforeEach(() => {
    const clearExpiredEntriesInMapWithTtlTaskResolveSpy = vitest.fn();
    const containerResolveSpy = vitest.spyOn(container, 'resolve').mockReturnValue({
      registerSet: clearExpiredEntriesInMapWithTtlTaskResolveSpy,
    });

    mapWithTtl = MapWithTtl.create(5);

    expect(containerResolveSpy).toHaveBeenCalledTimes(1);
    expect(containerResolveSpy).toHaveBeenCalledWith(ClearExpiredEntriesInMapsWithTtlTask);
    expect(clearExpiredEntriesInMapWithTtlTaskResolveSpy).toHaveBeenCalledTimes(1);
    expect(clearExpiredEntriesInMapWithTtlTaskResolveSpy).toHaveBeenCalledWith(mapWithTtl);
  });

  test('#get returns a previously set value', () => {
    mapWithTtl.set('a', 10);
    expect(mapWithTtl.get('a')).toBe(10);
  });

  test('#get returns null for a non-existing value', () => {
    expect(mapWithTtl.get('a')).toBeNull();
  });

  test('#get returns null for an expired value', () => {
    mapWithTtl.set('a', 100);
    vitest.advanceTimersByTime(5001);

    expect(mapWithTtl.get('a')).toBeNull();
  });

  test('Setting a value, makes #has return true for it', () => {
    expect(mapWithTtl.has('a')).toBe(false);
    mapWithTtl.set('a', 10);
    expect(mapWithTtl.has('a')).toBe(true);
  });

  test('#has returns false for a value that has expired', () => {
    mapWithTtl.set('a', 100);
    vitest.advanceTimersByTime(5001);

    expect(mapWithTtl.has('a')).toBe(false);
  });

  test('#getAgeInSeconds returns age of 0 for non-existing keys', () => {
    expect(mapWithTtl.getAgeInSeconds('a')).toBe(0);
  });

  test('#getAgeInSeconds returns age of 0 for expired key', () => {
    mapWithTtl.set('a', 10);
    vitest.advanceTimersByTime(5001);

    expect(mapWithTtl.has('a')).toBe(false);
    expect(mapWithTtl.getAgeInSeconds('a')).toBe(0);
  });

  test('#getAgeInSeconds returns the age of the value in seconds', () => {
    mapWithTtl.set('a', 10);

    expect(mapWithTtl.getAgeInSeconds('a')).toBe(0);
    vitest.advanceTimersByTime(2000);
    expect(mapWithTtl.getAgeInSeconds('a')).toBe(2);
  });

  test('#clear removes all values', () => {
    mapWithTtl.set('a', 10);
    mapWithTtl.set('b', 20);

    expect(mapWithTtl.has('a')).toBe(true);
    expect(mapWithTtl.has('b')).toBe(true);

    mapWithTtl.clear();

    expect(mapWithTtl.has('a')).toBe(false);
    expect(mapWithTtl.has('b')).toBe(false);
  });

  test('#clearExpired removes all expired values', () => {
    mapWithTtl.set('a', 10);
    vitest.advanceTimersByTime(2500);
    mapWithTtl.set('b', 20);

    vitest.advanceTimersByTime(5000);
    mapWithTtl.clearExpired();

    expect(mapWithTtl.has('a')).toBe(false);
    expect(mapWithTtl.has('b')).toBe(true);
  });
});
