import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { createTimer, getTimerState, stopTimer, clearAllTimers } from '../../../src/server/services/timerService.js';

describe('timerService', () => {
  beforeEach(() => { clearAllTimers(); });
  afterEach(() => { clearAllTimers(); });

  test('createTimer stores timer state', () => {
    const st = Date.now();
    createTimer('s1', st, 2700000, () => {});
    const state = getTimerState('s1');
    expect(state).toBeDefined();
    expect(state.startTime).toBe(st);
    expect(state.timeLimit).toBe(2700000);
  });

  test('getTimerState returns elapsed and remaining', () => {
    createTimer('s2', Date.now() - 60000, 2700000, () => {});
    const state = getTimerState('s2');
    expect(state.elapsed).toBeGreaterThanOrEqual(59000);
    expect(state.remaining).toBeLessThanOrEqual(2641000);
    expect(state.percent).toBeGreaterThan(1);
  });

  test('getTimerState returns null for unknown', () => {
    expect(getTimerState('x')).toBeNull();
  });

  test('stopTimer removes the timer', () => {
    createTimer('s3', Date.now(), 2700000, () => {});
    stopTimer('s3');
    expect(getTimerState('s3')).toBeNull();
  });
});
