import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const questionsPath = path.join(__dirname, '..', 'config', 'questions.json');
let questions = [];
try {
  questions = JSON.parse(fs.readFileSync(questionsPath, 'utf-8'));
} catch (err) {
  console.error('Failed to load questions.json:', err.message);
}

export const questionsRouter = Router();

questionsRouter.get('/questions', (req, res) => {
  const safe = questions.map(({ hidden_tests, canonical_solution, ...rest }) => rest);
  return res.json({ ok: true, total: safe.length, questions: safe });
});

questionsRouter.get('/questions/:id', (req, res) => {
  const q = questions.find((item) => item.id === req.params.id);
  if (!q) {
    return res.status(404).json({ error: 'Question not found' });
  }
  const { hidden_tests, canonical_solution, ...safe } = q;
  return res.json({ ok: true, question: safe });
});
