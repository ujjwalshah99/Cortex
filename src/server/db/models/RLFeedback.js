import mongoose from 'mongoose';

const rlFeedbackSchema = new mongoose.Schema({
  sessionId: { type: String, required: true, index: true },
  stuckIndex: Number,
  slmShouldCallLlm: Boolean,
  interviewerMessage: String,
  helpLevel: Number,
  candidateResponse: { type: String, enum: ['engaged', 'silent_progressed', 'silent_stuck', 'asked_more_help'] },
  observationWindowMs: { type: Number, default: 180000 },
  postOutcome: { type: String, enum: ['progressed', 'still_stuck', null], default: null },
  reward: { type: Number, default: 0 },
  weightsAtTime: [Number],
  thresholdAtTime: Number,
  problemDifficulty: String,
  problemId: String,
  createdAt: { type: Date, default: Date.now },
  resolvedAt: Date,
});

export const RLFeedback = mongoose.model('RLFeedback', rlFeedbackSchema);
