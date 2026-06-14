import { callGemini } from '../utils/gemini.js';
import { Snapshot } from '../db/models/Snapshot.js';

const SLM_SYSTEM_PROMPT = `You are an AI assistant analyzing a coding session to determine if the user is struggling.
Analyze the provided data step-by-step:
1. Code Analysis - Is the code making progress? Are there obvious errors?
2. Metric Evaluation - Look at churnRatio, failureStreak, idle time, undo counts
3. Historical Context - Is the user repeatedly changing the same lines?
4. Synthesize - Make a holistic judgment

Output ONLY a JSON object:
{"should_call_llm": true/false, "reasoning": "your analysis"}`;

export async function evaluateWithSLM(sessionState, snapshotMetrics) {
  const prompt = buildSLMPrompt(sessionState, snapshotMetrics);

  const { success, text, error } = await callGemini(prompt, SLM_SYSTEM_PROMPT);

  if (!success) {
    // Fallback: if heuristic confidence is high (S > T + 15), proceed without SLM
    if (snapshotMetrics.stuckIndex > (snapshotMetrics.threshold || 55) + 15) {
      return { shouldCallLlm: true, reasoning: 'SLM unavailable, heuristic confidence high', fallbackUsed: true };
    }
    return { shouldCallLlm: false, reasoning: `SLM failed: ${error}`, fallbackUsed: true };
  }

  // Parse response
  const parsed = parseSLMResponse(text);

  // Save snapshot
  try {
    await Snapshot.create({
      sessionId: sessionState.sessionId,
      code: sessionState.currentCode,
      metrics: snapshotMetrics,
      prompt,
      systemPrompt: SLM_SYSTEM_PROMPT,
      response: text,
      shouldCallLlm: parsed.shouldCallLlm,
      reasoning: parsed.reasoning,
      fallbackUsed: false,
    });
  } catch (err) {
    console.error('Failed to save SLM snapshot:', err.message);
  }

  return parsed;
}

function buildSLMPrompt(state, metrics) {
  const parts = [];
  parts.push('CURRENT CODE:');
  parts.push(state.currentCode || '(empty)');
  parts.push('');
  parts.push('METRICS:');
  for (const [k, v] of Object.entries(metrics)) {
    parts.push(`- ${k}: ${v}`);
  }

  // Recent runs
  if (state.submissions && state.submissions.length > 0) {
    const recent = state.submissions.slice(-3);
    parts.push('');
    parts.push('RECENT RUNS:');
    for (const s of recent) {
      const out = (s.output || '').substring(0, 500);
      const err = (s.error || '').substring(0, 500);
      parts.push(`- output: ${out}`);
      parts.push(`  error: ${err}`);
    }
  }

  // Line history (compact)
  if (state.lineHistory && state.lineHistory.size > 0) {
    parts.push('');
    parts.push('LINE HISTORY (last 3 versions per line):');
    let count = 0;
    for (const [line, versions] of state.lineHistory) {
      if (count >= 30) { parts.push('(truncated)'); break; }
      const tail = versions.slice(-3);
      const display = tail.map(v => {
        let s = `[ts=${v.timestamp}]`;
        if (v.content) s += ` '${v.content.substring(0, 80)}'`;
        if (v.metrics) {
          const m = v.metrics;
          s += ` {churn=${m.churnRatio || '-'}, undo=${m.undoCount || 0}}`;
        }
        return s;
      }).join(' | ');
      parts.push(`- L${line}: ${display}`);
      count++;
    }
  }

  return parts.join('\n');
}

function parseSLMResponse(text) {
  try {
    const obj = JSON.parse(text);
    if (typeof obj.should_call_llm === 'boolean') {
      return { shouldCallLlm: obj.should_call_llm, reasoning: obj.reasoning || '' };
    }
  } catch {}

  // Try to find JSON in response
  try {
    const match = text.match(/\{[\s\S]*?"should_call_llm"[\s\S]*?\}/);
    if (match) {
      const obj = JSON.parse(match[0]);
      return { shouldCallLlm: Boolean(obj.should_call_llm), reasoning: obj.reasoning || '' };
    }
  } catch {}

  return { shouldCallLlm: false, reasoning: 'Failed to parse SLM response' };
}
