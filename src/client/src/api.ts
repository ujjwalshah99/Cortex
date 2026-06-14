import axios from 'axios';
import type { RunResult, SubmitResult, QuestionItem } from './types';

const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:3000/api';

export async function runCode(language: string, code: string, questionId?: string): Promise<RunResult> {
  const resp = await axios.post(`${API_BASE}/run`, { language, code, questionId });
  return resp.data;
}

export async function checkSyntax(language: string, code: string): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  const resp = await axios.post(`${API_BASE}/check`, { language, code });
  return resp.data;
}

export async function submitCode(language: string, code: string, questionId: string): Promise<SubmitResult> {
  const resp = await axios.post(`${API_BASE}/submit`, { language, code, questionId });
  return resp.data;
}

export async function fetchQuestions(): Promise<{ ok: boolean; total: number; questions: QuestionItem[] }> {
  const resp = await axios.get(`${API_BASE}/questions`);
  return resp.data;
}

export async function fetchQuestionById(id: string): Promise<{ ok: boolean; question: QuestionItem }> {
  const resp = await axios.get(`${API_BASE}/questions/${id}`);
  return resp.data;
}
