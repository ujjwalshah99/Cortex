import { describe, test, expect } from '@jest/globals';
import { buildTestHarnessCode, compareOutput, buildTestResults } from '../../../src/server/services/testCaseRunner.js';

describe('testCaseRunner', () => {
  test('buildTestHarnessCode wraps python code with harness', () => {
    const candidateCode = 'def two_sum(nums, target):\n    return [0, 1]';
    const harness = 'import json, sys\nprint(json.dumps([]))';
    const result = buildTestHarnessCode(candidateCode, harness);
    expect(result).toContain('def two_sum');
    expect(result).toContain('import json, sys');
    expect(result.indexOf('def two_sum')).toBeLessThan(result.indexOf('import json, sys'));
  });

  test('compareOutput matches exact arrays', () => {
    expect(compareOutput([0, 1], [0, 1])).toBe(true);
  });

  test('compareOutput matches arrays regardless of order', () => {
    expect(compareOutput([1, 0], [0, 1])).toBe(true);
  });

  test('compareOutput rejects different values', () => {
    expect(compareOutput([0, 2], [0, 1])).toBe(false);
  });

  test('compareOutput matches primitives', () => {
    expect(compareOutput(42, 42)).toBe(true);
    expect(compareOutput('hello', 'hello')).toBe(true);
  });

  test('compareOutput rejects mismatched primitives', () => {
    expect(compareOutput(42, 43)).toBe(false);
  });

  test('buildTestResults creates correct structure', () => {
    const rawResults = [
      { output: [0, 1], error: null, time_ms: 5 },
      { output: [1, 2], error: null, time_ms: 3 },
    ];
    const tests = [
      { input: { nums: [2, 7], target: 9 }, output: [0, 1] },
      { input: { nums: [3, 2, 4], target: 6 }, output: [1, 2] },
    ];
    const results = buildTestResults(rawResults, tests, 'public');
    expect(results).toHaveLength(2);
    expect(results[0].testId).toBe('public-0');
    expect(results[0].passed).toBe(true);
    expect(results[1].testId).toBe('public-1');
    expect(results[1].passed).toBe(true);
  });

  test('buildTestResults marks failed test', () => {
    const rawResults = [
      { output: [0, 0], error: null, time_ms: 5 },
    ];
    const tests = [
      { input: { nums: [3, 3], target: 6 }, output: [0, 1] },
    ];
    const results = buildTestResults(rawResults, tests, 'public');
    expect(results[0].passed).toBe(false);
    expect(results[0].actual).toEqual([0, 0]);
    expect(results[0].expected).toEqual([0, 1]);
  });

  test('buildTestResults handles runtime error', () => {
    const rawResults = [
      { output: null, error: 'NameError: name x is not defined', time_ms: 0 },
    ];
    const tests = [
      { input: { nums: [1, 2], target: 3 }, output: [0, 1] },
    ];
    const results = buildTestResults(rawResults, tests, 'hidden');
    expect(results[0].passed).toBe(false);
    expect(results[0].testId).toBe('hidden-0');
  });
});
