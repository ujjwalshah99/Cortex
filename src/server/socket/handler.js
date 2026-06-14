import {
  createSession, getSessionState, applyTelemetry, applyTabEvent, stopSession,
} from '../services/sessionManager.js';
import { createTimer, getTimerState, stopTimer } from '../services/timerService.js';
import { flushSession } from '../services/writeBufferFlusher.js';
import { Session } from '../db/models/Session.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const questionsPath = path.join(__dirname, '..', 'config', 'questions.json');
let questions = [];
try { questions = JSON.parse(fs.readFileSync(questionsPath, 'utf-8')); } catch (err) {
  console.error('Failed to load questions.json:', err.message);
}

export function registerSocketHandlers(io) {
  io.on('connection', (socket) => {
    console.log(`Socket connected: ${socket.id}`);

    socket.on('start-session', async (data) => {
      try {
        const { candidateName, candidateEmail, language, questionId } = data;
        const question = questions.find(q => q.id === questionId) || questions[0];
        const initialCode = question?.canonical_skeleton?.[language] || '';
        const difficulty = question?.difficulty?.label || 'medium';
        const timeLimit = parseInt(process.env.SESSION_TIME_LIMIT_MS || '2700000', 10);

        const { sessionId, startTime } = createSession({
          language, initialCode, candidateName, candidateEmail,
          questionId: question?.id, difficulty, timeLimit,
        });

        // Persist to MongoDB
        try {
          await Session.create({
            sessionId, language, initialCode, startTime, timeLimit,
            difficulty, questionId: question?.id, status: 'active',
            candidate: { name: candidateName, email: candidateEmail },
            meta: { socketId: socket.id },
          });
        } catch (err) { console.error('Failed to persist session:', err.message); }

        socket.join(sessionId);

        // Start timer
        createTimer(sessionId, startTime, timeLimit, (sid) => {
          stopSession(sid, 'timeout');
          io.to(sid).emit('session-timeout', {});
        });

        // Timer sync every 10s
        const timerSync = setInterval(() => {
          const ts = getTimerState(sessionId);
          if (ts) {
            io.to(sessionId).emit('timer-sync', {
              elapsed: ts.elapsed, remaining: ts.remaining,
              percent: Math.round(ts.percent * 10) / 10,
            });
          } else { clearInterval(timerSync); }
        }, 10000);

        // Strip hidden tests
        const { hidden_tests, canonical_solution, ...safeQuestion } = question || {};

        socket.emit('session-created', {
          sessionId, question: safeQuestion, initialCode, timeLimit, startTime,
        });
      } catch (err) {
        console.error('start-session error:', err);
        socket.emit('error', { message: 'Failed to start session' });
      }
    });

    socket.on('telemetry', (data) => {
      try {
        const { sessionId } = data;
        if (sessionId) applyTelemetry(sessionId, data);
      } catch (err) { console.error('telemetry error:', err.message); }
    });

    socket.on('telemetry-meta', (data) => {
      try {
        const { sessionId, type, timestamp } = data;
        if (sessionId) applyTabEvent(sessionId, { type, timestamp });
      } catch (err) { console.error('telemetry-meta error:', err.message); }
    });

    socket.on('reconnect-session', async (data) => {
      try {
        const { sessionId } = data;
        const state = getSessionState(sessionId);

        if (state) {
          socket.join(sessionId);
          socket.emit('session-restored', {
            code: state.currentCode, language: state.language,
            startTime: state.startTime, timeLimit: state.timeLimit,
            helpLevel: state.helpLevel, struggleScore: state.struggleScore,
            candidate: state.candidate, questionId: state.questionId,
          });
        } else {
          const doc = await Session.findOne({ sessionId });
          if (doc && doc.status === 'active') {
            socket.emit('session-restored', {
              code: doc.initialCode, language: doc.language,
              startTime: doc.startTime, timeLimit: doc.timeLimit,
              helpLevel: 0, struggleScore: 0,
              candidate: doc.candidate, questionId: doc.questionId,
            });
          } else {
            socket.emit('error', { message: 'Session not found or already ended' });
          }
        }
      } catch (err) {
        console.error('reconnect-session error:', err);
        socket.emit('error', { message: 'Failed to reconnect session' });
      }
    });

    socket.on('disconnect', () => {
      console.log(`Socket disconnected: ${socket.id}`);
    });
  });
}
