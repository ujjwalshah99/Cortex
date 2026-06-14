import { GoogleGenerativeAI } from '@google/generative-ai';

const API_KEY = process.env.GEMINI_API_KEY;
let genAI = null;
let model = null;

function getModel() {
  if (!model) {
    if (!API_KEY) {
      console.warn('GEMINI_API_KEY not set - LLM calls will fail');
      return null;
    }
    genAI = new GoogleGenerativeAI(API_KEY);
    model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
  }
  return model;
}

export async function callGemini(prompt, systemPrompt = null) {
  const m = getModel();
  if (!m) return { success: false, text: '', error: 'Gemini API key not configured' };

  try {
    const parts = [];
    if (systemPrompt) parts.push({ role: 'user', parts: [{ text: systemPrompt }] }, { role: 'model', parts: [{ text: 'Understood. I will follow these instructions.' }] });
    parts.push({ role: 'user', parts: [{ text: prompt }] });

    const result = await m.generateContent({ contents: parts });
    const text = result.response?.text() || '';
    return { success: true, text, error: null };
  } catch (err) {
    console.error('Gemini API error:', err.message);
    return { success: false, text: '', error: err.message };
  }
}
