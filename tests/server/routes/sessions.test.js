import { describe, test, expect } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import { sessionsRouter } from '../../../src/server/routes/sessions.js';

const app = express();
app.use(express.json());
app.use('/api', sessionsRouter);

describe('sessions routes', () => {
  test('GET /api/sessions returns response (200 or 503)', async () => {
    const res = await request(app).get('/api/sessions');
    expect([200, 503]).toContain(res.status);
  }, 15000);

  test('GET /api/session/:id returns 404 or 503 for non-existent', async () => {
    const res = await request(app).get('/api/session/nonexistent');
    expect([404, 503]).toContain(res.status);
  }, 15000);

  test('GET /api/session/:id/chat returns response', async () => {
    const res = await request(app).get('/api/session/nonexistent/chat');
    expect([200, 503]).toContain(res.status);
  }, 15000);
});
