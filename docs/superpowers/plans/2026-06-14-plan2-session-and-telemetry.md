# Plan 2: Session & Telemetry System

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the session lifecycle (create/stop/get/list), real-time telemetry ingestion via Socket.io, server-side write buffering to MongoDB, timer service, and the 30s snapshot loop.

**Architecture:** Session state lives in-memory on the server (a Map of sessionId -> state object). Telemetry arrives via WebSocket every ~350ms and is applied instantly to in-memory state. A write buffer flushes accumulated events to MongoDB every 5 seconds. A 30s server-side snapshot loop persists code + metrics snapshots for analytics. Timer service tracks per-session countdown and emits sync events.

**Tech Stack:** Express, Socket.io, Mongoose, uuid

---

## File Map

| File | Responsibility |
|---|---|
| `src/server/services/sessionManager.js` | In-memory session state Map + create/get/stop/list + write buffer + flush logic |
| `src/server/db/models/Snapshot.js` | Snapshot Mongoose model for 30s snapshots |
| `src/server/services/timerService.js` | Per-session countdown timer, emits timer-sync via Socket.io |
| `src/server/services/snapshotLoop.js` | 30s server-side loop: read in-memory state, persist snapshot to MongoDB |
| `src/server/socket/handler.js` | Socket.io event handlers: start-session, telemetry, telemetry-meta, chat-message, run-code, submit-code, reconnect-session |
| `src/server/routes/sessions.js` | REST: GET /api/sessions, GET /api/session/:id, GET /api/session/:id/chat |
| `tests/server/services/sessionManager.test.js` | Unit tests for session manager |
| `tests/server/services/timerService.test.js` | Unit tests for timer service |
| `tests/server/routes/sessions.test.js` | Integration tests for session REST routes |

---

### Task 1: Snapshot Model

**Files:**
- Create: `src/server/db/models/Snapshot.js`

- [ ] **Step 1: Create Snapshot schema**

```javascript
import mongoose from 'mongoose';

const snapshotSchema = new mongoose.Schema({
  sessionId: { type: String, required: true, index: true },
  code: { type: String, required: true },
  metrics: {
    progressiveSeconds: Number,
    avgChurnRatio: Number,
    failureStreak: Number,
    stuckIndex: Number,
    pasteCount: Number,
    tabAwayCount: Number,
    tabAwayTotalMs: Number,
  },
  prompt: String,
  systemPrompt: String,
  response: String,
  shouldCallLlm: { type: Boolean, index: true },
  reasoning: String,
  fallbackUsed: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

export const Snapshot = mongoose.model('Snapshot', snapshotSchema);
```

- [ ] **Step 2: Commit**

```bash
git add src/server/db/models/Snapshot.js
git commit -m "feat: add Snapshot mongoose model"
```

---

### Task 2: Session Manager Service

**Files:**
- Create: `src/server/services/sessionManager.js`
- Create: `tests/server/services/sessionManager.test.js`

- [ ] **Step 1: Write tests**

```javascript
import { describe, test, expect, beforeEach } from '@jest/globals';
import {
  createSession,
  getSession,
  stopSession,
  listSessions,
  applyTelemetry,
  getSessionState,
  clearAllSessions,
} from '../../../src/server/services/sessionManager.js';

describe('sessionManager', () => {
  beforeEach(() => {
    clearAllSessions();
  });

  test('createSession returns sessionId and stores state', () => {
    const result = createSession({
      language: 'python',
      initialCode: 'def foo(): pass',
      candidateName: 'John',
      candidateEmail: 'john@test.com',
      questionId: 'dsa-easy-001',
      difficulty: 'easy',
      timeLimit: 2700000,
    });
    expect(result.sessionId).toBeDefined();
    expect(typeof result.sessionId).toBe('string');
    expect(result.startTime).toBeDefined();

    const state = getSessionState(result.sessionId);
    expect(state).toBeDefined();
    expect(state.language).toBe('python');
    expect(state.candidate.name).toBe('John');
    expect(state.currentCode).toBe('def foo(): pass');
    expect(state.status).toBe('active');
  });

  test('getSession returns null for non-existent session', () => {
    expect(getSessionState('nonexistent')).toBeNull();
  });

  test('stopSession sets endTime and status', () => {
    const { sessionId } = createSession({
      language: 'python',
      initialCode: '',
      candidateName: 'Test',
      questionId: 'q1',
      difficulty: 'easy',
      timeLimit: 2700000,
    });
    stopSession(sessionId, 'submitted');
    const state = getSessionState(sessionId);
    expect(state.endTime).toBeDefined();
    expect(state.status).toBe('submitted');
  });

  test('listSessions returns all active session summaries', () => {
    createSession({ language: 'python', initialCode: '', candidateName: 'A', questionId: 'q1', difficulty: 'easy', timeLimit: 100 });
    createSession({ language: 'java', initialCode: '', candidateName: 'B', questionId: 'q2', difficulty: 'medium', timeLimit: 100 });
    const list = listSessions();
    expect(list).toHaveLength(2);
    expect(list[0].language).toBeDefined();
    expect(list[0].candidateName).toBeDefined();
  });

  test('applyTelemetry updates in-memory state', () => {
    const { sessionId } = createSession({
      language: 'python',
      initialCode: 'x = 1',
      candidateName: 'Test',
      questionId: 'q1',
      difficulty: 'easy',
      timeLimit: 100,
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/shipsy/Desktop/gen-ai-project && npm test -- --testPathPattern=sessionManager`
Expected: FAIL

- [ ] **Step 3: Implement sessionManager.js**

```javascript
import { v4 as uuid } from 'uuid';

// In-memory session store: Map<sessionId, sessionState>
const sessions = new Map();

// Write buffer: Map<sessionId, { events[], lineUpdates[], lineMetrics[], tabEvents[] }>
const writeBuffers = new Map();

// Flush interval handle
let flushInterval = null;
const FLUSH_INTERVAL_MS = 5000;

export function createSession({ language, initialCode, candidateName, candidateEmail, questionId, difficulty, timeLimit }) {
  const sessionId = uuid();
  const startTime = Date.now();

  const state = {
    sessionId,
    language,
    initialCode,
    currentCode: initialCode,
    startTime,
    endTime: null,
    timeLimit: timeLimit || 2700000,
    difficulty: difficulty || 'easy',
    questionId: questionId || null,
    status: 'active',
    candidate: {
      name: candidateName || '',
      email: candidateEmail || '',
    },
    // In-memory telemetry accumulation
    pendingEvents: [],       // EDIT/PASTE events waiting to be flushed to Mongo
    lineHistory: new Map(),  // Map<lineNumber, Array<{timestamp, content, metrics}>>
    tabEvents: [],           // TAB_AWAY/TAB_RETURN events
    submissions: [],         // all_submissions
    // Metrics for heuristic engine
    failureStreak: 0,
    lastRunError: null,
    lastRunTestResults: null,
    pasteCount: 0,
    tabAwayCount: 0,
    tabAwayTotalMs: 0,
    lastTabAwayTs: null,
    // Snapshot tracking
    snapshotCount: 0,
    // Help level (driven by heuristic, not LLM)
    helpLevel: 0,
    struggleScore: 0,
    // Chat state
    messageCount: 0,
    lastMessageTs: null,
    injectionCooldownUntil: null,
  };

  sessions.set(sessionId, state);
  writeBuffers.set(sessionId, { events: [], lineUpdates: [], lineMetrics: [], tabEvents: [] });

  return { sessionId, startTime };
}

export function getSessionState(sessionId) {
  return sessions.get(sessionId) || null;
}

export function stopSession(sessionId, status = 'abandoned') {
  const state = sessions.get(sessionId);
  if (!state) return null;
  state.endTime = Date.now();
  state.status = status;
  return state;
}

export function listSessions() {
  const list = [];
  for (const [id, state] of sessions) {
    list.push({
      sessionId: id,
      language: state.language,
      candidateName: state.candidate.name,
      candidateEmail: state.candidate.email,
      status: state.status,
      startTime: state.startTime,
      endTime: state.endTime,
      difficulty: state.difficulty,
      questionId: state.questionId,
    });
  }
  return list;
}

export function applyTelemetry(sessionId, telemetry) {
  const state = sessions.get(sessionId);
  if (!state) return;
  const buffer = writeBuffers.get(sessionId);

  const { edits = [], lineUpdates = [], lineMetrics = [], pasteEvents = [] } = telemetry;

  // Apply edits to in-memory state + buffer for Mongo flush
  for (const edit of edits) {
    state.pendingEvents.push(edit);
    if (buffer) buffer.events.push(edit);
  }

  // Apply paste events
  for (const paste of pasteEvents) {
    state.pasteCount++;
    state.pendingEvents.push(paste);
    if (buffer) buffer.events.push(paste);
  }

  // Apply line updates to in-memory lineHistory
  for (const lu of lineUpdates) {
    const { lineNumber, timestamp, content } = lu;
    if (!state.lineHistory.has(lineNumber)) {
      state.lineHistory.set(lineNumber, []);
    }
    state.lineHistory.get(lineNumber).push({ timestamp, content });

    // Update currentCode approximation: set line content
    const lines = state.currentCode.split('\n');
    while (lines.length < lineNumber) lines.push('');
    lines[lineNumber - 1] = content;
    state.currentCode = lines.join('\n');

    if (buffer) buffer.lineUpdates.push(lu);
  }

  // Apply line metrics to in-memory lineHistory
  for (const lm of lineMetrics) {
    const { lineNumber, timestamp, metrics } = lm;
    if (!state.lineHistory.has(lineNumber)) {
      state.lineHistory.set(lineNumber, []);
    }
    state.lineHistory.get(lineNumber).push({ timestamp, metrics });
    if (buffer) buffer.lineMetrics.push(lm);
  }
}

export function applyTabEvent(sessionId, event) {
  const state = sessions.get(sessionId);
  if (!state) return;
  const buffer = writeBuffers.get(sessionId);

  if (event.type === 'TAB_AWAY') {
    state.tabAwayCount++;
    state.lastTabAwayTs = event.timestamp;
    const tabEvent = { timestamp: event.timestamp, type: 'TAB_AWAY' };
    state.tabEvents.push(tabEvent);
    if (buffer) buffer.tabEvents.push(tabEvent);
  } else if (event.type === 'TAB_RETURN') {
    const durationMs = state.lastTabAwayTs ? event.timestamp - state.lastTabAwayTs : 0;
    state.tabAwayTotalMs += durationMs;
    state.lastTabAwayTs = null;
    const tabEvent = { timestamp: event.timestamp, type: 'TAB_RETURN', durationMs };
    state.tabEvents.push(tabEvent);
    if (buffer) buffer.tabEvents.push(tabEvent);
  }
}

export function recordSubmission(sessionId, submission) {
  const state = sessions.get(sessionId);
  if (!state) return;
  state.submissions.push(submission);

  // Update failure streak
  if (submission.error && !submission.testResults?.some(r => r.passed)) {
    state.failureStreak++;
  } else {
    state.failureStreak = 0;
  }
  state.lastRunError = submission.error || null;
  state.lastRunTestResults = submission.testResults || null;
}

export function getWriteBuffer(sessionId) {
  return writeBuffers.get(sessionId) || null;
}

export function clearWriteBuffer(sessionId) {
  writeBuffers.set(sessionId, { events: [], lineUpdates: [], lineMetrics: [], tabEvents: [] });
}

export function removeSession(sessionId) {
  sessions.delete(sessionId);
  writeBuffers.delete(sessionId);
}

export function clearAllSessions() {
  sessions.clear();
  writeBuffers.clear();
}

export function getAllSessionIds() {
  return Array.from(sessions.keys());
}
```

- [ ] **Step 4: Run tests**

Run: `cd /Users/shipsy/Desktop/gen-ai-project && npm test -- --testPathPattern=sessionManager`
Expected: All 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/server/services/sessionManager.js tests/server/services/sessionManager.test.js
git commit -m "feat: add in-memory session manager with write buffering"
```

---

### Task 3: Timer Service

**Files:**
- Create: `src/server/services/timerService.js`
- Create: `tests/server/services/timerService.test.js`

- [ ] **Step 1: Write tests**

```javascript
import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { createTimer, getTimerState, stopTimer, clearAllTimers } from '../../../src/server/services/timerService.js';

describe('timerService', () => {
  beforeEach(() => { clearAllTimers(); });
  afterEach(() => { clearAllTimers(); });

  test('createTimer starts a timer for a session', () => {
    const startTime = Date.now();
    createTimer('sess-1', startTime, 2700000, () => {});
    const state = getTimerState('sess-1');
    expect(state).toBeDefined();
    expect(state.startTime).toBe(startTime);
    expect(state.timeLimit).toBe(2700000);
  });

  test('getTimerState returns elapsed and remaining', () => {
    const startTime = Date.now() - 60000; // started 1 min ago
    createTimer('sess-2', startTime, 2700000, () => {});
    const state = getTimerState('sess-2');
    expect(state.elapsed).toBeGreaterThanOrEqual(59000);
    expect(state.remaining).toBeLessThanOrEqual(2641000);
    expect(state.percent).toBeGreaterThan(1);
    expect(state.percent).toBeLessThan(5);
  });

  test('getTimerState returns null for unknown session', () => {
    expect(getTimerState('nonexistent')).toBeNull();
  });

  test('stopTimer removes the timer', () => {
    createTimer('sess-3', Date.now(), 2700000, () => {});
    stopTimer('sess-3');
    expect(getTimerState('sess-3')).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/shipsy/Desktop/gen-ai-project && npm test -- --testPathPattern=timerService`

- [ ] **Step 3: Implement timerService.js**

```javascript
// Per-session timer management
// Stores timer state and handles sync + timeout callbacks

const timers = new Map();

export function createTimer(sessionId, startTime, timeLimit, onTimeout) {
  if (timers.has(sessionId)) {
    stopTimer(sessionId);
  }

  const state = {
    sessionId,
    startTime,
    timeLimit,
    onTimeout,
    syncInterval: null,
    timeoutHandle: null,
  };

  // Set timeout for session expiry
  const remaining = timeLimit - (Date.now() - startTime);
  if (remaining > 0) {
    state.timeoutHandle = setTimeout(() => {
      if (onTimeout) onTimeout(sessionId);
      stopTimer(sessionId);
    }, remaining);
  }

  timers.set(sessionId, state);
  return state;
}

export function getTimerState(sessionId) {
  const timer = timers.get(sessionId);
  if (!timer) return null;

  const now = Date.now();
  const elapsed = now - timer.startTime;
  const remaining = Math.max(0, timer.timeLimit - elapsed);
  const percent = Math.min(100, (elapsed / timer.timeLimit) * 100);

  return {
    sessionId,
    startTime: timer.startTime,
    timeLimit: timer.timeLimit,
    elapsed,
    remaining,
    percent,
    urgencyFlag: percent >= 80,
  };
}

export function stopTimer(sessionId) {
  const timer = timers.get(sessionId);
  if (!timer) return;
  if (timer.syncInterval) clearInterval(timer.syncInterval);
  if (timer.timeoutHandle) clearTimeout(timer.timeoutHandle);
  timers.delete(sessionId);
}

export function clearAllTimers() {
  for (const [id] of timers) {
    stopTimer(id);
  }
}
```

- [ ] **Step 4: Run tests**

Run: `cd /Users/shipsy/Desktop/gen-ai-project && npm test -- --testPathPattern=timerService`
Expected: All 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/server/services/timerService.js tests/server/services/timerService.test.js
git commit -m "feat: add per-session timer service"
```

---

### Task 4: Snapshot Loop

**Files:**
- Create: `src/server/services/snapshotLoop.js`

- [ ] **Step 1: Implement server-side 30s snapshot loop**

```javascript
import { getAllSessionIds, getSessionState } from './sessionManager.js';
import { Snapshot } from '../db/models/Snapshot.js';

let loopInterval = null;
const SNAPSHOT_INTERVAL_MS = 30000;

export function startSnapshotLoop() {
  if (loopInterval) return;

  loopInterval = setInterval(async () => {
    const sessionIds = getAllSessionIds();

    for (const sessionId of sessionIds) {
      const state = getSessionState(sessionId);
      if (!state || state.status !== 'active') continue;

      try {
        await takeSnapshot(sessionId, state);
      } catch (err) {
        console.error(`Snapshot failed for session ${sessionId}:`, err.message);
      }
    }
  }, SNAPSHOT_INTERVAL_MS);
}

export function stopSnapshotLoop() {
  if (loopInterval) {
    clearInterval(loopInterval);
    loopInterval = null;
  }
}

export async function takeSnapshot(sessionId, state) {
  state.snapshotCount++;
  const progressiveSeconds = state.snapshotCount * 30;

  // Compute average churn ratio from lineHistory
  let totalChurn = 0;
  let churnCount = 0;
  for (const [, versions] of state.lineHistory) {
    for (const v of versions) {
      if (v.metrics?.churnRatio) {
        totalChurn += v.metrics.churnRatio;
        churnCount++;
      }
    }
  }
  const avgChurnRatio = churnCount > 0 ? totalChurn / churnCount : 0;

  const snapshot = {
    sessionId,
    code: state.currentCode,
    metrics: {
      progressiveSeconds,
      avgChurnRatio: Math.round(avgChurnRatio * 100) / 100,
      failureStreak: state.failureStreak,
      stuckIndex: state.struggleScore,
      pasteCount: state.pasteCount,
      tabAwayCount: state.tabAwayCount,
      tabAwayTotalMs: state.tabAwayTotalMs,
    },
    // SLM fields left null -- filled by heuristic/SLM in Plan 4
    prompt: null,
    systemPrompt: null,
    response: null,
    shouldCallLlm: null,
    reasoning: null,
    fallbackUsed: false,
    createdAt: new Date(),
  };

  try {
    await Snapshot.create(snapshot);
  } catch (err) {
    console.error(`Failed to save snapshot for ${sessionId}:`, err.message);
  }

  return snapshot;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/server/services/snapshotLoop.js
git commit -m "feat: add 30s server-side snapshot loop"
```

---

### Task 5: MongoDB Write Buffer Flush

**Files:**
- Create: `src/server/services/writeBufferFlusher.js`

- [ ] **Step 1: Implement the flusher**

```javascript
import { Session } from '../db/models/Session.js';
import { getAllSessionIds, getWriteBuffer, clearWriteBuffer, getSessionState } from './sessionManager.js';

let flushInterval = null;
const FLUSH_INTERVAL_MS = 5000;

export function startWriteBufferFlusher() {
  if (flushInterval) return;

  flushInterval = setInterval(async () => {
    const sessionIds = getAllSessionIds();

    for (const sessionId of sessionIds) {
      try {
        await flushSession(sessionId);
      } catch (err) {
        console.error(`Write buffer flush failed for ${sessionId}:`, err.message);
      }
    }
  }, FLUSH_INTERVAL_MS);
}

export function stopWriteBufferFlusher() {
  if (flushInterval) {
    clearInterval(flushInterval);
    flushInterval = null;
  }
}

export async function flushSession(sessionId) {
  const buffer = getWriteBuffer(sessionId);
  if (!buffer) return;

  const { events, lineUpdates, lineMetrics, tabEvents } = buffer;
  const hasData = events.length > 0 || lineUpdates.length > 0 || lineMetrics.length > 0 || tabEvents.length > 0;
  if (!hasData) return;

  // Clear buffer immediately to avoid double-flush
  clearWriteBuffer(sessionId);

  const updateOps = {};

  // Push raw events (EDIT, PASTE)
  if (events.length > 0) {
    updateOps.$push = { events: { $each: events } };
  }

  // Push tab events
  if (tabEvents.length > 0) {
    if (!updateOps.$push) updateOps.$push = {};
    updateOps.$push.tabEvents = { $each: tabEvents };
  }

  // Push line updates and metrics into lineHistory
  for (const lu of lineUpdates) {
    const field = `lineHistory.${lu.lineNumber}`;
    if (!updateOps.$push) updateOps.$push = {};
    if (!updateOps.$push[field]) updateOps.$push[field] = { $each: [] };
    updateOps.$push[field].$each.push({ timestamp: lu.timestamp, content: lu.content });
  }

  for (const lm of lineMetrics) {
    const field = `lineHistory.${lm.lineNumber}`;
    if (!updateOps.$push) updateOps.$push = {};
    if (!updateOps.$push[field]) updateOps.$push[field] = { $each: [] };
    updateOps.$push[field].$each.push({ timestamp: lm.timestamp, metrics: lm.metrics });
  }

  if (Object.keys(updateOps).length > 0) {
    await Session.updateOne({ sessionId }, updateOps, { upsert: false });
  }
}

export async function forceFlushAll() {
  const sessionIds = getAllSessionIds();
  for (const sessionId of sessionIds) {
    try {
      await flushSession(sessionId);
    } catch (err) {
      console.error(`Force flush failed for ${sessionId}:`, err.message);
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/server/services/writeBufferFlusher.js
git commit -m "feat: add write buffer flusher (batched MongoDB writes every 5s)"
```

---

### Task 6: Socket.io Handler

**Files:**
- Create: `src/server/socket/handler.js`

- [ ] **Step 1: Implement Socket.io event handlers**

```javascript
import {
  createSession,
  getSessionState,
  applyTelemetry,
  applyTabEvent,
  stopSession,
} from '../services/sessionManager.js';
import { createTimer, getTimerState, stopTimer } from '../services/timerService.js';
import { forceFlushAll, flushSession } from '../services/writeBufferFlusher.js';
import { Session } from '../db/models/Session.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load questions for session creation
const questionsPath = path.join(__dirname, '..', 'config', 'questions.json');
let questions = [];
try {
  questions = JSON.parse(fs.readFileSync(questionsPath, 'utf-8'));
} catch (err) {
  console.error('Failed to load questions.json:', err.message);
}

export function registerSocketHandlers(io) {
  io.on('connection', (socket) => {
    console.log(`Socket connected: ${socket.id}`);

    // Start a new interview session
    socket.on('start-session', async (data) => {
      try {
        const { candidateName, candidateEmail, language, questionId } = data;
        const question = questions.find(q => q.id === questionId) || questions[0];
        const initialCode = question?.canonical_skeleton?.[language] || '';
        const difficulty = question?.difficulty?.label || 'medium';
        const timeLimit = parseInt(process.env.SESSION_TIME_LIMIT_MS || '2700000', 10);

        const { sessionId, startTime } = createSession({
          language,
          initialCode,
          candidateName,
          candidateEmail,
          questionId: question?.id,
          difficulty,
          timeLimit,
        });

        // Persist session to MongoDB
        try {
          await Session.create({
            sessionId,
            language,
            initialCode,
            startTime,
            timeLimit,
            difficulty,
            questionId: question?.id,
            status: 'active',
            candidate: { name: candidateName, email: candidateEmail },
            meta: { socketId: socket.id },
          });
        } catch (err) {
          console.error('Failed to persist session:', err.message);
        }

        // Join socket room for this session
        socket.join(sessionId);

        // Start timer
        createTimer(sessionId, startTime, timeLimit, (sid) => {
          // On timeout
          stopSession(sid, 'timeout');
          io.to(sid).emit('session-timeout', {});
        });

        // Start timer sync (every 10s)
        const timerSyncInterval = setInterval(() => {
          const timerState = getTimerState(sessionId);
          if (timerState) {
            io.to(sessionId).emit('timer-sync', {
              elapsed: timerState.elapsed,
              remaining: timerState.remaining,
              percent: Math.round(timerState.percent * 10) / 10,
            });
          } else {
            clearInterval(timerSyncInterval);
          }
        }, 10000);

        // Strip hidden tests before sending question to client
        const { hidden_tests, canonical_solution, ...safeQuestion } = question || {};

        socket.emit('session-created', {
          sessionId,
          question: safeQuestion,
          initialCode,
          timeLimit,
          startTime,
        });
      } catch (err) {
        console.error('start-session error:', err);
        socket.emit('error', { message: 'Failed to start session' });
      }
    });

    // Receive telemetry batch
    socket.on('telemetry', (data) => {
      try {
        const { sessionId } = data;
        if (!sessionId) return;
        applyTelemetry(sessionId, data);
      } catch (err) {
        console.error('telemetry error:', err.message);
      }
    });

    // Tab visibility change
    socket.on('telemetry-meta', (data) => {
      try {
        const { sessionId, type, timestamp } = data;
        if (!sessionId) return;
        applyTabEvent(sessionId, { type, timestamp });
      } catch (err) {
        console.error('telemetry-meta error:', err.message);
      }
    });

    // Reconnect existing session
    socket.on('reconnect-session', async (data) => {
      try {
        const { sessionId } = data;
        const state = getSessionState(sessionId);

        if (state) {
          // Reconnect from in-memory state
          socket.join(sessionId);
          socket.emit('session-restored', {
            code: state.currentCode,
            language: state.language,
            startTime: state.startTime,
            timeLimit: state.timeLimit,
            helpLevel: state.helpLevel,
            struggleScore: state.struggleScore,
            candidate: state.candidate,
            questionId: state.questionId,
          });
        } else {
          // Try restoring from MongoDB
          const doc = await Session.findOne({ sessionId });
          if (doc && doc.status === 'active') {
            socket.emit('session-restored', {
              code: doc.initialCode,
              language: doc.language,
              startTime: doc.startTime,
              timeLimit: doc.timeLimit,
              helpLevel: 0,
              struggleScore: 0,
              candidate: doc.candidate,
              questionId: doc.questionId,
            });
          } else {
            socket.emit('error', { message: 'Session not found or already ended' });
          }
        }
      } catch (err) {
        console.error('reconnect-session error:', err);
        socket.emit('error', { message: 'Failed to reconnect session' });
      }
    });

    socket.on('disconnect', () => {
      console.log(`Socket disconnected: ${socket.id}`);
    });
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/server/socket/handler.js
git commit -m "feat: add socket.io event handlers for session and telemetry"
```

---

### Task 7: Session REST Routes

**Files:**
- Create: `src/server/routes/sessions.js`
- Create: `tests/server/routes/sessions.test.js`

- [ ] **Step 1: Write tests**

```javascript
import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import mongoose from 'mongoose';
import request from 'supertest';
import express from 'express';
import { sessionsRouter } from '../../../src/server/routes/sessions.js';

const app = express();
app.use(express.json());
app.use('/api', sessionsRouter);

describe('sessions routes', () => {
  test('GET /api/sessions returns empty array when no sessions in Mongo', async () => {
    // This test will work without Mongo connection -- route handles errors gracefully
    const res = await request(app).get('/api/sessions');
    // Either 200 with sessions or 503 if no DB
    expect([200, 503]).toContain(res.status);
  });

  test('GET /api/session/:id returns 404 for non-existent session', async () => {
    const res = await request(app).get('/api/session/nonexistent');
    expect([404, 503]).toContain(res.status);
  });
});
```

- [ ] **Step 2: Implement sessions.js**

```javascript
import { Router } from 'express';
import { Session } from '../db/models/Session.js';
import { ChatLog } from '../db/models/ChatLog.js';

export const sessionsRouter = Router();

// GET /api/sessions -- list all sessions (analytics)
sessionsRouter.get('/sessions', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 100, 500);
    const sessions = await Session.find({}, {
      _id: 0,
      sessionId: 1,
      language: 1,
      candidate: 1,
      status: 1,
      startTime: 1,
      endTime: 1,
      difficulty: 1,
      questionId: 1,
      finalResults: 1,
      interviewSummary: 1,
      createdAt: 1,
    }).sort({ createdAt: -1 }).limit(limit).lean();

    return res.json({ ok: true, sessions });
  } catch (err) {
    console.error('/api/sessions error:', err.message);
    return res.status(503).json({ error: 'Database error' });
  }
});

// GET /api/session/:id -- get full session data (replay + analytics)
sessionsRouter.get('/session/:id', async (req, res) => {
  try {
    const session = await Session.findOne({ sessionId: req.params.id }).lean();
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    return res.json({ ok: true, session });
  } catch (err) {
    console.error('/api/session/:id error:', err.message);
    return res.status(503).json({ error: 'Database error' });
  }
});

// GET /api/session/:id/chat -- get chat history for a session
sessionsRouter.get('/session/:id/chat', async (req, res) => {
  try {
    const logs = await ChatLog.find(
      { sessionId: req.params.id },
      { _id: 0, trigger: 1, extractedJson: 1, userMessage: 1, helpLevel: 1, struggleScore: 1, createdAt: 1 }
    ).sort({ createdAt: 1 }).limit(50).lean();

    return res.json({ ok: true, messages: logs });
  } catch (err) {
    console.error('/api/session/:id/chat error:', err.message);
    return res.status(503).json({ error: 'Database error' });
  }
});

// POST /api/sessions/cleanup-empty -- delete sessions with no events
sessionsRouter.post('/sessions/cleanup-empty', async (req, res) => {
  try {
    const result = await Session.deleteMany({
      $or: [{ events: { $size: 0 } }, { events: { $exists: false } }],
    });
    return res.json({ ok: true, deletedCount: result?.deletedCount || 0 });
  } catch (err) {
    console.error('/api/sessions/cleanup-empty error:', err.message);
    return res.status(503).json({ error: 'Database error' });
  }
});
```

- [ ] **Step 3: Create ChatLog model** (needed by sessions route)

Create `src/server/db/models/ChatLog.js`:

```javascript
import mongoose from 'mongoose';

const chatLogSchema = new mongoose.Schema({
  sessionId: { type: String, required: true, index: true },
  trigger: { type: String, required: true, enum: ['CANDIDATE_MESSAGE', 'CODE_RUN', 'PROACTIVE_GUIDANCE'] },
  priority: { type: Number },
  prompt: String,
  rawResponse: String,
  extractedJson: {
    output_chat: String,
  },
  helpLevel: Number,
  struggleScore: Number,
  userMessage: String,
  codeSnapshot: String,
  codeBlockDetected: { type: Boolean, default: false },
  fallbackUsed: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

export const ChatLog = mongoose.model('ChatLog', chatLogSchema);
```

- [ ] **Step 4: Run tests**

Run: `cd /Users/shipsy/Desktop/gen-ai-project && npm test -- --testPathPattern=sessions`
Expected: Tests pass (handling DB-less scenario gracefully)

- [ ] **Step 5: Commit**

```bash
git add src/server/routes/sessions.js src/server/db/models/ChatLog.js tests/server/routes/sessions.test.js
git commit -m "feat: add session REST routes and ChatLog model"
```

---

### Task 8: Wire Everything into index.js

**Files:**
- Modify: `src/server/index.js`

- [ ] **Step 1: Update index.js to wire in all new components**

Read `src/server/index.js` first. Then add these imports and wiring:

After existing imports, add:
```javascript
import { sessionsRouter } from './routes/sessions.js';
import { registerSocketHandlers } from './socket/handler.js';
import { startSnapshotLoop, stopSnapshotLoop } from './services/snapshotLoop.js';
import { startWriteBufferFlusher, stopWriteBufferFlusher } from './services/writeBufferFlusher.js';
```

After the existing `app.use('/api', questionsRouter);`, add:
```javascript
app.use('/api', sessionsRouter);
```

Replace the Socket.io placeholder block:
```javascript
io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`);
  socket.on('disconnect', () => {
    console.log(`Socket disconnected: ${socket.id}`);
  });
});
```
With:
```javascript
registerSocketHandlers(io);
```

In the `start()` function, after `httpServer.listen(...)`, add:
```javascript
startSnapshotLoop();
startWriteBufferFlusher();
console.log('Snapshot loop started (30s interval)');
console.log('Write buffer flusher started (5s interval)');
```

Add graceful shutdown:
```javascript
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down...');
  stopSnapshotLoop();
  stopWriteBufferFlusher();
  const { forceFlushAll } = await import('./services/writeBufferFlusher.js');
  await forceFlushAll();
  process.exit(0);
});
```

- [ ] **Step 2: Run ALL tests**

Run: `cd /Users/shipsy/Desktop/gen-ai-project && npm test`
Expected: All tests pass (existing + new)

- [ ] **Step 3: Commit**

```bash
git add src/server/index.js
git commit -m "feat: wire session routes, socket handlers, snapshot loop, and write buffer into server"
```

---

## Plan 2 Complete

After completing all 8 tasks, you have:
- In-memory session manager with create/get/stop/list
- Telemetry ingestion via Socket.io (edits, line updates, line metrics, paste events, tab events)
- Write buffer that batches MongoDB writes every 5s
- 30s server-side snapshot loop persisting code + metrics
- Per-session timer with countdown and sync events
- Session REST routes for analytics (list, detail, chat history)
- Snapshot and ChatLog Mongoose models
- Socket.io handlers for session lifecycle

**Next plan:** Plan 3 -- Frontend Interview UI
