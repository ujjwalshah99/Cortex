import { Router } from 'express';
import { Session } from '../db/models/Session.js';
import { ChatLog } from '../db/models/ChatLog.js';

export const sessionsRouter = Router();

sessionsRouter.get('/sessions', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 100, 500);
    const sessions = await Session.find({}, {
      _id: 0, sessionId: 1, language: 1, candidate: 1, status: 1,
      startTime: 1, endTime: 1, difficulty: 1, questionId: 1,
      finalResults: 1, interviewSummary: 1, createdAt: 1,
    }).sort({ createdAt: -1 }).limit(limit).lean();
    return res.json({ ok: true, sessions });
  } catch (err) {
    console.error('/api/sessions error:', err.message);
    return res.status(503).json({ error: 'Database error' });
  }
});

sessionsRouter.get('/session/:id', async (req, res) => {
  try {
    const session = await Session.findOne({ sessionId: req.params.id }).lean();
    if (!session) return res.status(404).json({ error: 'Session not found' });
    return res.json({ ok: true, session });
  } catch (err) {
    console.error('/api/session/:id error:', err.message);
    return res.status(503).json({ error: 'Database error' });
  }
});

sessionsRouter.get('/session/:id/chat', async (req, res) => {
  try {
    const logs = await ChatLog.find(
      { sessionId: req.params.id },
      { _id: 0, trigger: 1, extractedJson: 1, userMessage: 1, helpLevel: 1, struggleScore: 1, createdAt: 1 }
    ).sort({ createdAt: 1 }).limit(50).lean();
    return res.json({ ok: true, messages: logs });
  } catch (err) {
    console.error('/api/session/:id/chat error:', err.message);
    return res.status(503).json({ error: 'Database error' });
  }
});

sessionsRouter.post('/sessions/cleanup-empty', async (req, res) => {
  try {
    const result = await Session.deleteMany({
      $or: [{ events: { $size: 0 } }, { events: { $exists: false } }],
    });
    return res.json({ ok: true, deletedCount: result?.deletedCount || 0 });
  } catch (err) {
    console.error('/api/sessions/cleanup-empty error:', err.message);
    return res.status(503).json({ error: 'Database error' });
  }
});
