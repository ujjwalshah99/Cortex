import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { runCode, checkSyntax } from '../services/codeRunner.js';
import { runTestCases } from '../services/testCaseRunner.js';
import { LANGUAGE_CONFIG } from '../config/defaults.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const questionsPath = path.join(__dirname, '..', 'config', 'questions.json');
let questions = [];
try {
  questions = JSON.parse(fs.readFileSync(questionsPath, 'utf-8'));
} catch (err) {
  console.error('Failed to load questions.json:', err.message);
}

export const executionRouter = Router();

executionRouter.post('/run', async (req, res) => {
  try {
    const { language, code, questionId } = req.body;
    if (!language || !code) {
      return res.status(400).json({ error: 'language and code are required' });
    }
    if (!(language in LANGUAGE_CONFIG)) {
      return res.status(400).json({ error: `Unsupported language: ${language}` });
    }

    if (!questionId) {
      const result = await runCode(language, code);
      return res.json(result);
    }

    const question = questions.find((q) => q.id === questionId);
    if (!question) {
      const result = await runCode(language, code);
      return res.json(result);
    }

    const { error, testResults } = await runTestCases(language, code, question, false);
    const basicResult = await runCode(language, code);
    return res.json({ output: basicResult.output, error: error || basicResult.error, testResults });
  } catch (err) {
    console.error('/api/run error:', err);
    return res.status(500).json({ error: err.message });
  }
});

executionRouter.post('/check', async (req, res) => {
  try {
    const { language, code } = req.body;
    if (!language || !code) {
      return res.status(400).json({ error: 'language and code are required' });
    }
    const result = await checkSyntax(language, code);
    return res.json(result);
  } catch (err) {
    console.error('/api/check error:', err);
    return res.status(500).json({ error: err.message });
  }
});

executionRouter.post('/submit', async (req, res) => {
  try {
    const { language, code, questionId } = req.body;
    if (!language || !code) {
      return res.status(400).json({ error: 'language and code are required' });
    }
    if (!questionId) {
      return res.status(400).json({ error: 'questionId is required for submission' });
    }
    const question = questions.find((q) => q.id === questionId);
    if (!question) {
      return res.status(404).json({ error: 'Question not found' });
    }

    const { error, testResults } = await runTestCases(language, code, question, true);
    const publicResults = testResults.filter((r) => r.testId.startsWith('public'));
    const hiddenResults = testResults.filter((r) => r.testId.startsWith('hidden'));
    const finalResults = {
      publicPassed: publicResults.filter((r) => r.passed).length,
      publicTotal: publicResults.length,
      hiddenPassed: hiddenResults.filter((r) => r.passed).length,
      hiddenTotal: hiddenResults.length,
      allPassed: testResults.every((r) => r.passed),
    };
    return res.json({ error, testResults, finalResults });
  } catch (err) {
    console.error('/api/submit error:', err);
    return res.status(500).json({ error: err.message });
  }
});
