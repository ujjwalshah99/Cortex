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
