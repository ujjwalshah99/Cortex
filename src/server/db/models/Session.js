import mongoose from 'mongoose';

const sessionEventSchema = new mongoose.Schema({
  timestamp: { type: Number, required: true },
  type: { type: String, required: true },
  payload: { type: mongoose.Schema.Types.Mixed, required: true },
}, { _id: false });

const lineVersionSchema = new mongoose.Schema({
  timestamp: { type: Number, required: true },
  content: { type: String },
  metrics: { type: mongoose.Schema.Types.Mixed },
}, { _id: false });

const testResultSchema = new mongoose.Schema({
  testId: { type: String, required: true },
  passed: { type: Boolean, required: true },
  input: { type: mongoose.Schema.Types.Mixed },
  expected: { type: mongoose.Schema.Types.Mixed },
  actual: { type: mongoose.Schema.Types.Mixed },
  executionTime: { type: Number },
}, { _id: false });

const submissionSchema = new mongoose.Schema({
  code: String,
  output: String,
  error: String,
  testResults: [testResultSchema],
  isSubmission: { type: Boolean, default: false },
  timestamp: { type: Number, default: () => Date.now() },
}, { _id: false });

const tabEventSchema = new mongoose.Schema({
  timestamp: { type: Number, required: true },
  type: { type: String, required: true },
  durationMs: { type: Number },
}, { _id: false });

const sessionSchema = new mongoose.Schema({
  sessionId: { type: String, required: true, index: true, unique: true },
  language: { type: String, required: true },
  initialCode: { type: String, required: true },
  startTime: { type: Number, required: true },
  endTime: { type: Number },
  timeLimit: { type: Number },
  difficulty: { type: String },
  questionId: { type: String },
  status: { type: String, default: 'active', enum: ['active', 'submitted', 'timeout', 'abandoned'] },

  candidate: {
    name: { type: String },
    email: { type: String },
  },

  events: { type: [sessionEventSchema], default: [] },
  lineHistory: { type: Map, of: [lineVersionSchema], default: {} },
  tabEvents: { type: [tabEventSchema], default: [] },
  all_submissions: { type: [submissionSchema], default: [] },

  finalResults: {
    publicPassed: Number,
    publicTotal: Number,
    hiddenPassed: Number,
    hiddenTotal: Number,
    allPassed: Boolean,
  },

  interviewSummary: {
    summary: String,
    strengths: [String],
    weaknesses: [String],
    rating: String,
    generatedAt: Date,
  },

  meta: { type: mongoose.Schema.Types.Mixed },
}, { timestamps: true });

export const Session = mongoose.model('Session', sessionSchema);
