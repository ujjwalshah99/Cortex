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
  if (loopInterval) { clearInterval(loopInterval); loopInterval = null; }
}

export async function takeSnapshot(sessionId, state) {
  state.snapshotCount++;
  const progressiveSeconds = state.snapshotCount * 30;

  let totalChurn = 0, churnCount = 0;
  for (const [, versions] of state.lineHistory) {
    for (const v of versions) {
      if (v.metrics?.churnRatio) { totalChurn += v.metrics.churnRatio; churnCount++; }
    }
  }
  const avgChurnRatio = churnCount > 0 ? Math.round((totalChurn / churnCount) * 100) / 100 : 0;

  const snapshot = {
    sessionId,
    code: state.currentCode,
    metrics: {
      progressiveSeconds,
      avgChurnRatio,
      failureStreak: state.failureStreak,
      stuckIndex: state.struggleScore,
      pasteCount: state.pasteCount,
      tabAwayCount: state.tabAwayCount,
      tabAwayTotalMs: state.tabAwayTotalMs,
    },
    prompt: null,
    systemPrompt: null,
    response: null,
    shouldCallLlm: null,
    reasoning: null,
    fallbackUsed: false,
    createdAt: new Date(),
  };

  try { await Snapshot.create(snapshot); } catch (err) {
    console.error(`Failed to save snapshot for ${sessionId}:`, err.message);
  }
  return snapshot;
}
