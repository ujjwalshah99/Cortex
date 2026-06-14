import { describe, test, expect } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import { executionRouter } from '../../../src/server/routes/execution.js';

const app = express();
app.use(express.json());
app.use('/api', executionRouter);

describe('execution routes', () => {
  test('POST /api/run returns 400 if language missing', async () => {
    const res = await request(app).post('/api/run').send({ code: 'print(1)' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  test('POST /api/run returns 400 if code missing', async () => {
    const res = await request(app).post('/api/run').send({ language: 'python' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  test('POST /api/run returns 400 for unsupported language', async () => {
    const res = await request(app).post('/api/run').send({ language: 'ruby', code: 'puts 1' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Unsupported');
  });

  test('POST /api/check returns 400 if language missing', async () => {
    const res = await request(app).post('/api/check').send({ code: 'print(1)' });
    expect(res.status).toBe(400);
  });

  test('POST /api/submit returns 400 if questionId missing', async () => {
    const res = await request(app).post('/api/submit').send({ language: 'python', code: 'x' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('questionId');
  });
});
