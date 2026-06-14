const timers = new Map();

export function createTimer(sessionId, startTime, timeLimit, onTimeout) {
  if (timers.has(sessionId)) stopTimer(sessionId);

  const state = { sessionId, startTime, timeLimit, onTimeout, timeoutHandle: null };

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
  return { sessionId, startTime: timer.startTime, timeLimit: timer.timeLimit, elapsed, remaining, percent, urgencyFlag: percent >= 80 };
}

export function stopTimer(sessionId) {
  const timer = timers.get(sessionId);
  if (!timer) return;
  if (timer.timeoutHandle) clearTimeout(timer.timeoutHandle);
  timers.delete(sessionId);
}

export function clearAllTimers() {
  for (const [id] of timers) stopTimer(id);
}
