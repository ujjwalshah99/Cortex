import { getAllSessionIds, getSessionState } from './sessionManager.js';
import { computeStuckIndex, markEscalation, deriveHelpLevel } from './heuristicEngine.js';
import { evaluateWithSLM } from './slmGateway.js';
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
        await processSnapshot(sessionId, state);
      } catch (err) {
        console.error(`Snapshot failed for ${sessionId}:`, err.message);
      }
    }
  }, SNAPSHOT_INTERVAL_MS);
}

export function stopSnapshotLoop() {
  if (loopInterval) { clearInterval(loopInterval); loopInterval = null; }
}

async function processSnapshot(sessionId, state) {
  state.snapshotCount = (state.snapshotCount || 0) + 1;

  // Tier 1: Heuristic (pure math, free)
  const heuristic = computeStuckIndex(state);
  state.struggleScore = heuristic.stuckIndex;
  state.helpLevel = deriveHelpLevel(heuristic.stuckIndex);

  const metrics = {
    progressiveSeconds: state.snapshotCount * 30,
    stuckIndex: heuristic.stuckIndex,
    threshold: heuristic.threshold,
    failureStreak: state.failureStreak,
    pasteCount: state.pasteCount,
    tabAwayCount: state.tabAwayCount,
    tabAwayTotalMs: state.tabAwayTotalMs,
    ...heuristic.signals,
  };

  // Tier 2: Conditional SLM call (only if threshold breached or warm zone)
  if (heuristic.shouldEscalate || heuristic.inWarmZone) {
    const slmResult = await evaluateWithSLM(state, metrics);

    if (slmResult.shouldCallLlm) {
      markEscalation(sessionId);
      // Signal to interviewer brain that proactive guidance is needed
      // This will be consumed by Plan 5 (interviewerBrain.js)
      state._pendingProactiveGuidance = true;
      console.log(`[SLM] Session ${sessionId}: stuck detected (S=${heuristic.stuckIndex}, help=${state.helpLevel})`);
    }
  } else {
    // Just persist metrics snapshot (no SLM call)
    try {
      await Snapshot.create({
        sessionId, code: state.currentCode, metrics,
        shouldCallLlm: null, reasoning: null, fallbackUsed: false,
      });
    } catch (err) {
      console.error(`Snapshot save failed for ${sessionId}:`, err.message);
    }
  }
}

export { processSnapshot };
