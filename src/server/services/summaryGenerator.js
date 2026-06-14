import { callGemini } from '../utils/gemini.js';
import { Session } from '../db/models/Session.js';
import { Snapshot } from '../db/models/Snapshot.js';
import { RLFeedback } from '../db/models/RLFeedback.js';

const SUMMARY_SYSTEM_PROMPT = `You are writing an interview evaluation as the interviewer "Cortex."
Write in first person ("I asked...", "The candidate...").
Output a JSON object:
{
  "summary": "A 3-5 sentence narrative of how the interview went",
  "strengths": ["strength 1", "strength 2"],
  "weaknesses": ["weakness 1"],
  "rating": "Strong Pass" or "Pass" or "Borderline" or "Fail"
}

Rating criteria:
- Strong Pass: Solved independently with minimal guidance, efficient solution
- Pass: Solved with some guidance, demonstrated understanding
- Borderline: Needed significant guidance, or partial solution
- Fail: Could not produce working solution even with heavy guidance`;

export async function generateInterviewSummary(sessionId) {
  const state = await Session.findOne({ sessionId }).lean();
  if (!state) return null;

  const snapshots = await Snapshot.find({ sessionId }).sort({ createdAt: -1 }).limit(5).lean();
  const feedback = await RLFeedback.find({ sessionId }).lean();

  const prompt = buildSummaryPrompt(state, snapshots, feedback);
  const { success, text } = await callGemini(prompt, SUMMARY_SYSTEM_PROMPT);

  let summary;
  if (success) {
    summary = parseSummaryResponse(text);
  }

  if (!summary) {
    // Fallback: data-only summary
    const lastSub = state.all_submissions?.[state.all_submissions.length - 1];
    const testsPassed = lastSub?.testResults?.filter(t => t.passed).length || 0;
    const testsTotal = lastSub?.testResults?.length || 0;
    const duration = state.endTime ? Math.round((state.endTime - state.startTime) / 1000 / 60) : '?';
    summary = {
      summary: `Session completed. ${testsPassed}/${testsTotal} tests passed. ${feedback.length} interviewer interventions. Duration: ${duration} minutes.`,
      strengths: [],
      weaknesses: [],
      rating: 'Data-only summary (LLM unavailable)',
    };
  }

  summary.generatedAt = new Date();

  // Save to session
  try {
    await Session.updateOne({ sessionId }, { $set: { interviewSummary: summary } });
  } catch (err) {
    console.error('Failed to save interview summary:', err.message);
  }

  return summary;
}

function buildSummaryPrompt(session, snapshots, feedback) {
  const parts = [];

  parts.push(`Candidate: ${session.candidate?.name || 'Unknown'}`);
  parts.push(`Problem: ${session.questionId}`);
  parts.push(`Language: ${session.language}`);
  parts.push(`Duration: ${session.endTime ? Math.round((session.endTime - session.startTime) / 1000) : '?'}s`);
  parts.push(`Status: ${session.status}`);
  parts.push('');

  // Final results
  if (session.finalResults) {
    parts.push('FINAL RESULTS:');
    parts.push(`Public: ${session.finalResults.publicPassed}/${session.finalResults.publicTotal}`);
    parts.push(`Hidden: ${session.finalResults.hiddenPassed}/${session.finalResults.hiddenTotal}`);
    parts.push(`All passed: ${session.finalResults.allPassed}`);
    parts.push('');
  }

  // Final code
  const lastSub = session.all_submissions?.[session.all_submissions.length - 1];
  if (lastSub?.code) {
    parts.push('FINAL CODE:');
    parts.push(lastSub.code.substring(0, 2000));
    parts.push('');
  }

  // Interventions
  if (feedback.length > 0) {
    parts.push(`INTERVIEWER INTERVENTIONS (${feedback.length}):`);
    for (const f of feedback) {
      parts.push(`- helpLevel=${f.helpLevel}, response=${f.candidateResponse}, outcome=${f.postOutcome}, reward=${f.reward}`);
      if (f.interviewerMessage) parts.push(`  said: "${f.interviewerMessage.substring(0, 200)}"`);
    }
    parts.push('');
  }

  // Struggle trajectory
  if (snapshots.length > 0) {
    parts.push('STRUGGLE TRAJECTORY (recent):');
    for (const s of snapshots.reverse()) {
      parts.push(`- ${s.metrics?.progressiveSeconds}s: stuckIndex=${s.metrics?.stuckIndex}, churn=${s.metrics?.avgChurnRatio}`);
    }
    parts.push('');
  }

  // Paste/tab events
  const tabCount = session.tabEvents?.length || 0;
  parts.push(`Tab switches: ${tabCount}`);
  parts.push('');
  parts.push('Write the interview evaluation now.');

  return parts.join('\n');
}

function parseSummaryResponse(text) {
  try {
    const obj = JSON.parse(text);
    if (obj.summary && obj.rating) return obj;
  } catch {}
  try {
    const m = text.match(/\{[\s\S]*?"summary"[\s\S]*?\}/);
    if (m) {
      const obj = JSON.parse(m[0]);
      if (obj.summary && obj.rating) return obj;
    }
  } catch {}
  return null;
}
