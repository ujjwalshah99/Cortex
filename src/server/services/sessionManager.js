import { v4 as uuidv4 } from 'uuid';

// In-memory session store: Map<sessionId, sessionState>
const sessions = new Map();

// Write buffers per session: Map<sessionId, {events[], lineUpdates[], lineMetrics[], tabEvents[]}>
const writeBuffers = new Map();

function createWriteBuffer() {
  return { events: [], lineUpdates: [], lineMetrics: [], tabEvents: [] };
}

export function createSession({
  language,
  initialCode,
  candidateName,
  candidateEmail,
  questionId,
  difficulty,
  timeLimit,
}) {
  const sessionId = uuidv4();
  const startTime = Date.now();

  const state = {
    sessionId,
    language,
    initialCode: initialCode || '',
    currentCode: initialCode || '',
    startTime,
    endTime: null,
    timeLimit,
    difficulty,
    questionId,
    status: 'active',
    candidate: {
      name: candidateName || '',
      email: candidateEmail || '',
    },
    pendingEvents: [],
    lineHistory: new Map(),
    tabEvents: [],
    submissions: [],
    failureStreak: 0,
    lastRunError: null,
    lastRunTestResults: null,
    pasteCount: 0,
    tabAwayCount: 0,
    tabAwayTotalMs: 0,
    lastTabAwayTs: null,
    snapshotCount: 0,
    helpLevel: 0,
    struggleScore: 0,
    messageCount: 0,
    lastMessageTs: null,
    injectionCooldownUntil: null,
  };

  sessions.set(sessionId, state);
  writeBuffers.set(sessionId, createWriteBuffer());

  return { sessionId, startTime };
}

export function getSessionState(sessionId) {
  return sessions.get(sessionId) || null;
}

export function stopSession(sessionId, status) {
  const state = sessions.get(sessionId);
  if (!state) return;
  state.endTime = Date.now();
  state.status = status || 'stopped';
}

export function listSessions() {
  return Array.from(sessions.values()).map((s) => ({
    sessionId: s.sessionId,
    language: s.language,
    status: s.status,
    startTime: s.startTime,
    endTime: s.endTime,
    candidate: s.candidate,
    questionId: s.questionId,
    difficulty: s.difficulty,
  }));
}

export function applyTelemetry(sessionId, { edits = [], lineUpdates = [], lineMetrics = [], pasteEvents = [] } = {}) {
  const state = sessions.get(sessionId);
  if (!state) return;

  const buffer = writeBuffers.get(sessionId) || createWriteBuffer();

  // Apply edit events
  for (const edit of edits) {
    state.pendingEvents.push(edit);
    buffer.events.push(edit);
    if (edit.type === 'PASTE') {
      state.pasteCount += 1;
    }
  }

  // Apply paste events (separate list)
  for (const paste of pasteEvents) {
    state.pendingEvents.push(paste);
    buffer.events.push(paste);
    state.pasteCount += 1;
  }

  // Apply line updates
  for (const update of lineUpdates) {
    const { lineNumber, timestamp, content } = update;
    if (!state.lineHistory.has(lineNumber)) {
      state.lineHistory.set(lineNumber, []);
    }
    state.lineHistory.get(lineNumber).push({ timestamp, content, metrics: null });
    buffer.lineUpdates.push(update);
  }

  // Apply line metrics
  for (const metric of lineMetrics) {
    const { lineNumber, timestamp, metrics } = metric;
    if (!state.lineHistory.has(lineNumber)) {
      state.lineHistory.set(lineNumber, []);
    }
    // Attach metrics to the latest entry for this line, or add a new entry
    const history = state.lineHistory.get(lineNumber);
    if (history.length > 0 && history[history.length - 1].metrics === null) {
      history[history.length - 1].metrics = metrics;
    } else {
      history.push({ timestamp, content: null, metrics });
    }
    buffer.lineMetrics.push(metric);
  }

  writeBuffers.set(sessionId, buffer);
}

export function applyTabEvent(sessionId, { type, timestamp }) {
  const state = sessions.get(sessionId);
  if (!state) return;

  const buffer = writeBuffers.get(sessionId) || createWriteBuffer();
  const event = { type, timestamp };

  state.tabEvents.push(event);
  buffer.tabEvents.push(event);

  if (type === 'TAB_AWAY') {
    state.tabAwayCount += 1;
    state.lastTabAwayTs = timestamp;
  } else if (type === 'TAB_RETURN') {
    if (state.lastTabAwayTs !== null) {
      state.tabAwayTotalMs += timestamp - state.lastTabAwayTs;
      state.lastTabAwayTs = null;
    }
  }

  writeBuffers.set(sessionId, buffer);
}

export function recordSubmission(sessionId, submission) {
  const state = sessions.get(sessionId);
  if (!state) return;

  state.submissions.push({ ...submission, timestamp: Date.now() });

  if (submission.success === false || submission.error) {
    state.failureStreak += 1;
    state.lastRunError = submission.error || null;
    state.lastRunTestResults = submission.testResults || null;
  } else {
    state.failureStreak = 0;
    state.lastRunError = null;
    state.lastRunTestResults = submission.testResults || null;
  }
}

export function getWriteBuffer(sessionId) {
  return writeBuffers.get(sessionId) || null;
}

export function clearWriteBuffer(sessionId) {
  writeBuffers.set(sessionId, createWriteBuffer());
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
