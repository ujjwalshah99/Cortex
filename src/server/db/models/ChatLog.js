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
