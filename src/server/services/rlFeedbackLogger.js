import { RLFeedback } from '../db/models/RLFeedback.js';
import { getSessionState } from './sessionManager.js';
import { HEURISTIC_DEFAULTS } from '../config/defaults.js';

const OBSERVATION_WINDOW_MS = parseInt(process.env.OBSERVATION_WINDOW_MS || '180000', 10);
const activeObservations = new Map(); // sessionId -> { feedbackId, startTime, initialState }

export async function logInterventionStart(sessionId, interviewerMessage, stuckIndex, helpLevel) {
  const state = getSessionState(sessionId);
  if (!state) return null;

  try {
    const doc = await RLFeedback.create({
      sessionId,
      stuckIndex,
      slmShouldCallLlm: true,
      interviewerMessage,
      helpLevel,
      candidateResponse: null,
      observationWindowMs: OBSERVATION_WINDOW_MS,
      postOutcome: null,
      reward: 0,
      weightsAtTime: HEURISTIC_DEFAULTS.weights,
      thresholdAtTime: HEURISTIC_DEFAULTS.thresholds[state.difficulty] || 55,
      problemDifficulty: state.difficulty,
      problemId: state.questionId,
    });

    // Start observation
    const initialState = {
      failureStreak: state.failureStreak,
      submissionCount: state.submissions.length,
      testsPassed: countPassedTests(state),
      messageCount: state.messageCount || 0,
    };

    activeObservations.set(sessionId, {
      feedbackId: doc._id,
      startTime: Date.now(),
      initialState,
    });

    // Schedule resolution
    setTimeout(() => resolveObservation(sessionId), OBSERVATION_WINDOW_MS);

    return doc._id;
  } catch (err) {
    console.error('RL feedback log failed:', err.message);
    return null;
  }
}

export async function resolveObservation(sessionId) {
  const obs = activeObservations.get(sessionId);
  if (!obs) return;

  activeObservations.delete(sessionId);

  const state = getSessionState(sessionId);
  if (!state) return;

  // Determine outcome
  const currentTestsPassed = countPassedTests(state);
  const hadNewSubmissions = state.submissions.length > obs.initialState.submissionCount;
  const testsImproved = currentTestsPassed > obs.initialState.testsPassed;
  const failureStreakBroken = state.failureStreak < obs.initialState.failureStreak;

  let postOutcome;
  let reward;
  let candidateResponse;

  if (testsImproved || failureStreakBroken) {
    postOutcome = 'progressed';
    reward = 1;
    candidateResponse = hadNewSubmissions ? 'engaged' : 'silent_progressed';
  } else if (hadNewSubmissions && state.failureStreak >= obs.initialState.failureStreak) {
    postOutcome = 'still_stuck';
    reward = 0;
    candidateResponse = 'silent_stuck';
  } else {
    // No activity — candidate may have been thinking or disengaged
    postOutcome = 'still_stuck';
    reward = -1;
    candidateResponse = 'silent_stuck';
  }

  // Check if candidate asked for more help (messageCount increased)
  if (state.messageCount > (obs.initialState.messageCount || 0)) {
    candidateResponse = 'asked_more_help';
    reward = 1;
  }

  try {
    await RLFeedback.updateOne(
      { _id: obs.feedbackId },
      { $set: { postOutcome, reward, candidateResponse, resolvedAt: new Date() } }
    );
  } catch (err) {
    console.error('RL feedback resolution failed:', err.message);
  }
}

export function hasActiveObservation(sessionId) {
  return activeObservations.has(sessionId);
}

function countPassedTests(state) {
  if (!state.submissions?.length) return 0;
  const last = state.submissions[state.submissions.length - 1];
  if (!last?.testResults) return 0;
  return last.testResults.filter(t => t.passed).length;
}
