import { HEURISTIC_DEFAULTS } from '../config/defaults.js';

const { weights, thresholds, gracePeriodMs, cooldownMs, warmZoneOffset } = HEURISTIC_DEFAULTS;

// Track per-session cooldown and last escalation time
const cooldowns = new Map();

export function computeStuckIndex(sessionState) {
  const now = Date.now();
  const sessionAge = now - sessionState.startTime;

  // Grace period: disabled for first 90 seconds
  if (sessionAge < gracePeriodMs) {
    return { stuckIndex: 0, shouldEscalate: false, inWarmZone: false, reason: 'grace_period' };
  }

  // Gather signals from session state
  const signals = extractSignals(sessionState);

  // Normalize all signals to 0-100 scale
  const normalized = [
    Math.min(100, (signals.idlePercent / 50) * 100),           // w1: idle time
    Math.min(100, (signals.avgChurnRatio / 3) * 100),           // w2: churn ratio
    Math.min(100, (signals.failureStreak / 5) * 100),           // w3: failure streak
    Math.min(100, (signals.delayOutlierFreq / 0.5) * 100),     // w4: delay outliers
    Math.min(100, (signals.undoFrequency / 10) * 100),          // w5: undo frequency
    Math.min(100, signals.keystrokeRateDrop),                    // w6: keystroke drop
    Math.min(100, (signals.sameLineOscillation / 5) * 100),     // w7: same-line oscillation
  ];

  // Weighted sum
  let S = 0;
  for (let i = 0; i < weights.length; i++) {
    S += weights[i] * normalized[i];
  }
  S = Math.round(S * 100) / 100;

  // Get threshold for difficulty
  const T = thresholds[sessionState.difficulty] || thresholds.medium;

  // Check cooldown
  const lastEscalation = cooldowns.get(sessionState.sessionId) || 0;
  const inCooldown = (now - lastEscalation) < cooldownMs;

  const shouldEscalate = S >= T && !inCooldown;
  const inWarmZone = S >= (T - warmZoneOffset) && S < T && !inCooldown;

  return { stuckIndex: S, shouldEscalate, inWarmZone, threshold: T, signals, reason: inCooldown ? 'cooldown' : 'computed' };
}

export function markEscalation(sessionId) {
  cooldowns.set(sessionId, Date.now());
}

export function clearCooldown(sessionId) {
  cooldowns.delete(sessionId);
}

export function deriveHelpLevel(stuckIndex) {
  if (stuckIndex < 25) return 0;
  if (stuckIndex < 50) return 1;
  if (stuckIndex < 75) return 2;
  return 3;
}

function extractSignals(state) {
  let totalIdle = 0, totalActive = 0, churnSum = 0, churnCount = 0;
  let delayOutliers = 0, totalDelays = 0;
  let undoTotal = 0, keystrokeRates = [];
  let lineEditCounts = new Map();

  for (const [lineNum, versions] of state.lineHistory) {
    let editCount = 0;
    for (const v of versions) {
      if (v.metrics) {
        totalIdle += v.metrics.idleMs || 0;
        totalActive += v.metrics.activeMs || 0;
        if (v.metrics.churnRatio) { churnSum += v.metrics.churnRatio; churnCount++; }
        if (v.metrics.delayOutlier) delayOutliers++;
        totalDelays++;
        undoTotal += v.metrics.undoCount || 0;
        if (v.metrics.keystrokeRate) keystrokeRates.push(v.metrics.keystrokeRate);
        editCount++;
      }
    }
    lineEditCounts.set(lineNum, editCount);
  }

  const idlePercent = (totalActive + totalIdle) > 0 ? (totalIdle / (totalActive + totalIdle)) * 100 : 0;
  const avgChurnRatio = churnCount > 0 ? churnSum / churnCount : 1.0;
  const delayOutlierFreq = totalDelays > 0 ? delayOutliers / totalDelays : 0;
  const undoFrequency = undoTotal;

  // Keystroke rate drop: compare recent vs baseline
  let keystrokeRateDrop = 0;
  if (keystrokeRates.length >= 4) {
    const baseline = keystrokeRates.slice(0, Math.floor(keystrokeRates.length / 2));
    const recent = keystrokeRates.slice(Math.floor(keystrokeRates.length / 2));
    const baseAvg = baseline.reduce((a, b) => a + b, 0) / baseline.length;
    const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
    if (baseAvg > 0) keystrokeRateDrop = Math.max(0, ((baseAvg - recentAvg) / baseAvg) * 100);
  }

  // Same-line oscillation: lines edited more than 3 times
  let sameLineOscillation = 0;
  for (const [, count] of lineEditCounts) {
    if (count > 3) sameLineOscillation++;
  }

  return {
    idlePercent, avgChurnRatio, failureStreak: state.failureStreak || 0,
    delayOutlierFreq, undoFrequency, keystrokeRateDrop, sameLineOscillation,
  };
}
