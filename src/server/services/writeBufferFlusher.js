import { Session } from '../db/models/Session.js';
import { getAllSessionIds, getWriteBuffer, clearWriteBuffer } from './sessionManager.js';

let flushInterval = null;
const FLUSH_INTERVAL_MS = 5000;

export function startWriteBufferFlusher() {
  if (flushInterval) return;
  flushInterval = setInterval(async () => {
    const sessionIds = getAllSessionIds();
    for (const sessionId of sessionIds) {
      try { await flushSession(sessionId); } catch (err) {
        console.error(`Write buffer flush failed for ${sessionId}:`, err.message);
      }
    }
  }, FLUSH_INTERVAL_MS);
}

export function stopWriteBufferFlusher() {
  if (flushInterval) { clearInterval(flushInterval); flushInterval = null; }
}

export async function flushSession(sessionId) {
  const buffer = getWriteBuffer(sessionId);
  if (!buffer) return;

  const { events, lineUpdates, lineMetrics, tabEvents } = buffer;
  const hasData = events.length > 0 || lineUpdates.length > 0 || lineMetrics.length > 0 || tabEvents.length > 0;
  if (!hasData) return;

  clearWriteBuffer(sessionId);

  const updateOps = {};

  if (events.length > 0) {
    updateOps.$push = { events: { $each: events } };
  }

  if (tabEvents.length > 0) {
    if (!updateOps.$push) updateOps.$push = {};
    updateOps.$push.tabEvents = { $each: tabEvents };
  }

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
    try { await flushSession(sessionId); } catch (err) {
      console.error(`Force flush failed for ${sessionId}:`, err.message);
    }
  }
}
