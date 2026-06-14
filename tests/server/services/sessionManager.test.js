import { describe, test, expect, beforeEach } from '@jest/globals';
import {
  createSession, getSessionState, stopSession, listSessions,
  applyTelemetry, clearAllSessions,
} from '../../../src/server/services/sessionManager.js';

describe('sessionManager', () => {
  beforeEach(() => { clearAllSessions(); });

  test('createSession returns sessionId and stores state', () => {
    const result = createSession({
      language: 'python', initialCode: 'def foo(): pass',
      candidateName: 'John', candidateEmail: 'john@test.com',
      questionId: 'dsa-easy-001', difficulty: 'easy', timeLimit: 2700000,
    });
    expect(result.sessionId).toBeDefined();
    expect(result.startTime).toBeDefined();
    const state = getSessionState(result.sessionId);
    expect(state.language).toBe('python');
    expect(state.candidate.name).toBe('John');
    expect(state.currentCode).toBe('def foo(): pass');
    expect(state.status).toBe('active');
  });

  test('getSessionState returns null for non-existent', () => {
    expect(getSessionState('nonexistent')).toBeNull();
  });

  test('stopSession sets endTime and status', () => {
    const { sessionId } = createSession({
      language: 'python', initialCode: '', candidateName: 'Test',
      questionId: 'q1', difficulty: 'easy', timeLimit: 100,
    });
    stopSession(sessionId, 'submitted');
    const state = getSessionState(sessionId);
    expect(state.endTime).toBeDefined();
    expect(state.status).toBe('submitted');
  });

  test('listSessions returns all sessions', () => {
    createSession({ language: 'python', initialCode: '', candidateName: 'A', questionId: 'q1', difficulty: 'easy', timeLimit: 100 });
    createSession({ language: 'java', initialCode: '', candidateName: 'B', questionId: 'q2', difficulty: 'medium', timeLimit: 100 });
    expect(listSessions()).toHaveLength(2);
  });

  test('applyTelemetry updates in-memory state', () => {
    const { sessionId } = createSession({
      language: 'python', initialCode: 'x = 1', candidateName: 'Test',
      questionId: 'q1', difficulty: 'easy', timeLimit: 100,
    });
    applyTelemetry(sessionId, {
      edits: [{ timestamp: 100, type: 'EDIT', payload: { changes: [] } }],
      lineUpdates: [{ lineNumber: 1, timestamp: 100, content: 'x = 2' }],
      lineMetrics: [{ lineNumber: 1, timestamp: 100, metrics: { activeMs: 500, churnRatio: 1.2 } }],
    });
    const state = getSessionState(sessionId);
    expect(state.pendingEvents).toHaveLength(1);
    expect(state.lineHistory.get(1)).toBeDefined();
  });

  test('applyTelemetry ignores non-existent session', () => {
    expect(() => applyTelemetry('nonexistent', { edits: [], lineUpdates: [], lineMetrics: [] })).not.toThrow();
  });
});
