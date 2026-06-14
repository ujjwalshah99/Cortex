import { callGemini } from '../utils/gemini.js';
import { ChatLog } from '../db/models/ChatLog.js';
import { validateOutput } from './promptGuard.js';
import { getTimerState } from './timerService.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load questions for hint templates
const questionsPath = path.join(__dirname, '..', 'config', 'questions.json');
let questions = [];
try { questions = JSON.parse(fs.readFileSync(questionsPath, 'utf-8')); } catch {}

const INTERVIEWER_SYSTEM_PROMPT = `You are "Cortex," an expert and empathetic AI technical interviewer conducting a coding interview.

Your persona:
- Be a human mentor, not a robot. Sound encouraging, patient, respectful.
- Probe, don't preach. Ask questions that make the candidate think.
- Never expose internal metrics (help_level, struggle_score) to the candidate.
- Be concise. The candidate is focused on coding.
- NEVER write code for the candidate. Not even pseudocode with specific syntax.
- If you catch yourself about to write code, rephrase as a conceptual explanation.

You will receive a guidance level (0-3):
- Level 0: No guidance needed. Just respond to questions naturally.
- Level 1 (Nudge): Ask probing questions pointing toward the right direction.
- Level 2 (Guide): Explain the approach conceptually without giving code.
- Level 3 (Direction): Walk through the algorithm step by step, still no code.

Output ONLY a JSON object: {"output_chat": "your message to the candidate"}
Do NOT include markdown, code blocks, or internal metrics in output_chat.`;

// Priority queue per session
const queues = new Map();

function getQueue(sessionId) {
  if (!queues.has(sessionId)) queues.set(sessionId, []);
  return queues.get(sessionId);
}

export function enqueueEvent(sessionId, event) {
  const queue = getQueue(sessionId);
  queue.push(event);
  queue.sort((a, b) => b.priority - a.priority);
}

export async function processQueue(sessionId, sessionState, io) {
  const queue = getQueue(sessionId);
  if (queue.length === 0) return;

  const event = queue.shift();
  const response = await generateResponse(sessionId, sessionState, event);

  if (response) {
    // Send to client
    io.to(sessionId).emit('interviewer-message', {
      text: response.text,
      trigger: event.trigger,
    });
  }
}

async function generateResponse(sessionId, state, event) {
  const { trigger, userMessage, code, runOutput, runError, testResults } = event;

  // Build prompt based on trigger type (tiered context)
  let prompt;
  if (trigger === 'CANDIDATE_MESSAGE') {
    prompt = buildFullContext(state, userMessage);
  } else if (trigger === 'CODE_RUN') {
    prompt = buildCodeRunContext(state, runOutput, runError, testResults);
  } else if (trigger === 'PROACTIVE_GUIDANCE') {
    prompt = buildProactiveContext(state);
  } else {
    return null;
  }

  const { success, text, error } = await callGemini(prompt, INTERVIEWER_SYSTEM_PROMPT);

  let responseText;
  let fallbackUsed = false;

  if (!success) {
    // Fallback
    fallbackUsed = true;
    if (trigger === 'PROACTIVE_GUIDANCE') {
      responseText = getHintTemplateFallback(state);
    } else if (trigger === 'CANDIDATE_MESSAGE') {
      responseText = "Sorry, I missed that -- could you say that again?";
    } else {
      return null;
    }
  } else {
    responseText = extractOutputChat(text) || text;
  }

  // Validate output (check for code leaks)
  const validation = validateOutput(responseText);
  const finalText = validation.safe ? responseText : validation.cleaned;

  // Log to MongoDB
  try {
    await ChatLog.create({
      sessionId,
      trigger,
      priority: event.priority,
      prompt,
      rawResponse: text || responseText,
      extractedJson: { output_chat: finalText },
      helpLevel: state.helpLevel,
      struggleScore: state.struggleScore,
      userMessage: userMessage || null,
      codeSnapshot: state.currentCode,
      codeBlockDetected: validation.codeBlockDetected,
      fallbackUsed,
    });
  } catch (err) {
    console.error('Failed to log chat:', err.message);
  }

  return { text: finalText };
}

function buildFullContext(state, userMessage) {
  const timer = getTimerState(state.sessionId);
  const question = questions.find(q => q.id === state.questionId);
  const parts = [];

  parts.push(`GUIDANCE LEVEL: ${state.helpLevel}`);
  parts.push(`STRUGGLE SCORE: ${state.struggleScore}`);
  parts.push('');

  if (question) {
    parts.push('QUESTION:');
    parts.push(question.Full_question || question.short_description || '');
    parts.push('');
    const templates = getHintTemplates(question, state.helpLevel);
    if (templates) {
      parts.push('HINT TEMPLATE (use as base, personalize):');
      parts.push(templates);
      parts.push('');
    }
  }

  // Conversation history (last 10)
  // We don't have full history in memory, so use what we have
  parts.push('CURRENT CODE:');
  parts.push(state.currentCode || '(empty)');
  parts.push('');

  // Recent runs
  if (state.submissions?.length > 0) {
    parts.push('RECENT RUNS:');
    for (const s of state.submissions.slice(-3)) {
      parts.push(`- output: ${(s.output || '').substring(0, 300)}`);
      parts.push(`  error: ${(s.error || '').substring(0, 300)}`);
    }
    parts.push('');
  }

  // Line history compact
  if (state.lineHistory?.size > 0) {
    parts.push('LINE HISTORY:');
    let count = 0;
    for (const [line, versions] of state.lineHistory) {
      if (count >= 20) break;
      const tail = versions.slice(-2);
      const display = tail.map(v => {
        let s = '';
        if (v.content) s += `'${v.content.substring(0, 60)}'`;
        if (v.metrics?.churnRatio) s += ` churn=${v.metrics.churnRatio}`;
        return s;
      }).filter(Boolean).join(' -> ');
      if (display) { parts.push(`  L${line}: ${display}`); count++; }
    }
    parts.push('');
  }

  if (timer) {
    parts.push(`TIME: Elapsed ${formatMs(timer.elapsed)}, Remaining ${formatMs(timer.remaining)}`);
    if (timer.urgencyFlag) parts.push('IMPORTANT: Candidate is running low on time. Suggest focusing on a working solution.');
    parts.push('');
  }

  parts.push(`Candidate says: ${userMessage}`);
  parts.push('');
  parts.push('Respond now as the interviewer.');

  return parts.join('\n');
}

function buildCodeRunContext(state, output, error, testResults) {
  const parts = [];
  parts.push(`GUIDANCE LEVEL: ${state.helpLevel}`);
  parts.push('');
  parts.push('CURRENT CODE:');
  parts.push(state.currentCode || '(empty)');
  parts.push('');
  parts.push('THIS RUN:');
  parts.push(`output: ${(output || '').substring(0, 500)}`);
  parts.push(`error: ${(error || '').substring(0, 500)}`);
  if (testResults?.length > 0) {
    const passed = testResults.filter(t => t.passed).length;
    parts.push(`tests: ${passed}/${testResults.length} passed`);
  }

  // Previous run for comparison
  if (state.submissions?.length >= 2) {
    const prev = state.submissions[state.submissions.length - 2];
    parts.push('');
    parts.push('PREVIOUS RUN:');
    parts.push(`output: ${(prev.output || '').substring(0, 300)}`);
    parts.push(`error: ${(prev.error || '').substring(0, 300)}`);
  }

  const timer = getTimerState(state.sessionId);
  if (timer) parts.push(`\nTIME: Elapsed ${formatMs(timer.elapsed)}, Remaining ${formatMs(timer.remaining)}`);

  parts.push('');
  parts.push('Comment briefly on this run result as the interviewer. Be concise.');

  return parts.join('\n');
}

function buildProactiveContext(state) {
  const question = questions.find(q => q.id === state.questionId);
  const parts = [];

  parts.push(`GUIDANCE LEVEL: ${state.helpLevel}`);
  parts.push(`STRUGGLE SCORE: ${state.struggleScore}`);
  parts.push('');

  if (question) {
    const templates = getHintTemplates(question, state.helpLevel);
    if (templates) {
      parts.push('HINT TEMPLATE (use as base, personalize to their code):');
      parts.push(templates);
      parts.push('');
    }
  }

  parts.push('CURRENT CODE:');
  parts.push(state.currentCode || '(empty)');
  parts.push('');

  // Key struggle metrics
  parts.push('STRUGGLE INDICATORS:');
  parts.push(`- Failure streak: ${state.failureStreak}`);
  parts.push(`- Paste count: ${state.pasteCount}`);
  parts.push(`- Tab-away count: ${state.tabAwayCount}`);

  const timer = getTimerState(state.sessionId);
  if (timer) {
    parts.push(`\nTIME: Elapsed ${formatMs(timer.elapsed)}, Remaining ${formatMs(timer.remaining)}`);
    if (timer.urgencyFlag) parts.push('IMPORTANT: Running low on time.');
  }

  parts.push('');
  parts.push('The candidate appears to be struggling. Proactively engage as their interviewer. Do NOT say "I noticed you are struggling." Instead, naturally ask a probing question or offer guidance matching the guidance level.');

  return parts.join('\n');
}

function getHintTemplates(question, helpLevel) {
  if (!question?.hint_templates?.length) return null;
  const template = question.hint_templates[0];
  if (helpLevel <= 0) return null;
  if (helpLevel === 1 && template.nudge) return `Nudge: ${template.nudge}`;
  if (helpLevel === 2 && template.guide) return `Guide: ${template.guide}`;
  if (helpLevel >= 3 && template.direction) return `Direction: ${template.direction}`;
  return template.nudge || template.guide || null;
}

function getHintTemplateFallback(state) {
  const question = questions.find(q => q.id === state.questionId);
  if (!question?.hint_templates?.length) return "How's it going? Let me know if you'd like to talk through your approach.";
  const t = question.hint_templates[0];
  if (state.helpLevel >= 3 && t.direction) return t.direction;
  if (state.helpLevel >= 2 && t.guide) return t.guide;
  if (t.nudge) return t.nudge;
  return "How's it going? Let me know if you'd like to talk through your approach.";
}

function extractOutputChat(text) {
  try {
    const obj = JSON.parse(text);
    if (typeof obj?.output_chat === 'string') return obj.output_chat;
  } catch {}
  try {
    const m = text.match(/\{[\s\S]*?"output_chat"[\s\S]*?\}/);
    if (m) {
      const obj = JSON.parse(m[0]);
      if (typeof obj?.output_chat === 'string') return obj.output_chat;
    }
  } catch {}
  return null;
}

function formatMs(ms) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
}

export function clearQueue(sessionId) {
  queues.delete(sessionId);
}
