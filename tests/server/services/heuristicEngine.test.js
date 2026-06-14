import { describe, test, expect } from '@jest/globals';
import { computeStuckIndex, deriveHelpLevel } from '../../../src/server/services/heuristicEngine.js';

function makeSession(overrides = {}) {
  return {
    sessionId: 'test-1',
    startTime: Date.now() - 120000, // 2 min ago (past grace period)
    difficulty: 'medium',
    failureStreak: 0,
    lineHistory: new Map(),
    pasteCount: 0,
    tabAwayCount: 0,
    tabAwayTotalMs: 0,
    ...overrides,
  };
}

describe('heuristicEngine', () => {
  test('returns 0 during grace period', () => {
    const session = makeSession({ startTime: Date.now() - 30000 }); // 30s ago
    const result = computeStuckIndex(session);
    expect(result.stuckIndex).toBe(0);
    expect(result.reason).toBe('grace_period');
  });

  test('returns low score for calm session', () => {
    const session = makeSession();
    const result = computeStuckIndex(session);
    expect(result.stuckIndex).toBeLessThan(20);
    expect(result.shouldEscalate).toBe(false);
  });

  test('returns high score for struggling session', () => {
    const lineHistory = new Map();
    lineHistory.set(1, [
      { timestamp: 1000, content: 'x = 1', metrics: { activeMs: 15000, idleMs: 8000, churnRatio: 3.5, delayOutlier: true, undoCount: 5, keystrokeRate: 2 } },
      { timestamp: 2000, content: 'x = 2', metrics: { activeMs: 12000, idleMs: 6000, churnRatio: 3.0, delayOutlier: true, undoCount: 3, keystrokeRate: 1.5 } },
      { timestamp: 3000, content: 'x = 1', metrics: { activeMs: 10000, idleMs: 5000, churnRatio: 2.8, delayOutlier: false, undoCount: 4, keystrokeRate: 1 } },
      { timestamp: 4000, content: 'x = 3', metrics: { activeMs: 8000, idleMs: 7000, churnRatio: 3.2, delayOutlier: true, undoCount: 6, keystrokeRate: 0.5 } },
    ]);
    const session = makeSession({ lineHistory, failureStreak: 4 });
    const result = computeStuckIndex(session);
    expect(result.stuckIndex).toBeGreaterThan(30);
  });

  test('deriveHelpLevel returns correct levels', () => {
    expect(deriveHelpLevel(10)).toBe(0);
    expect(deriveHelpLevel(30)).toBe(1);
    expect(deriveHelpLevel(60)).toBe(2);
    expect(deriveHelpLevel(80)).toBe(3);
  });
});
