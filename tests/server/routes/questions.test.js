import { describe, test, expect } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import { questionsRouter } from '../../../src/server/routes/questions.js';

const app = express();
app.use(express.json());
app.use('/api', questionsRouter);

describe('questions routes', () => {
  test('GET /api/questions returns all questions', async () => {
    const res = await request(app).get('/api/questions');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.questions)).toBe(true);
    expect(res.body.total).toBeGreaterThan(0);
  });

  test('GET /api/questions/:id returns specific question', async () => {
    const res = await request(app).get('/api/questions/dsa-easy-001');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.question.id).toBe('dsa-easy-001');
    expect(res.body.question.title).toBe('Two Sum');
  });

  test('GET /api/questions/:id returns 404 for unknown id', async () => {
    const res = await request(app).get('/api/questions/nonexistent');
    expect(res.status).toBe(404);
  });

  test('GET /api/questions strips hidden_tests', async () => {
    const res = await request(app).get('/api/questions');
    const q = res.body.questions[0];
    expect(q.hidden_tests).toBeUndefined();
  });

  test('GET /api/questions/:id strips hidden_tests', async () => {
    const res = await request(app).get('/api/questions/dsa-easy-001');
    expect(res.body.question.hidden_tests).toBeUndefined();
  });
});
