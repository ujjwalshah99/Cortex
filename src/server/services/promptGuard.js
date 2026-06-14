// Prompt injection detection
const BANNED_PATTERNS = [
  /ignore\s*(all\s*)?(previous|above|system|prior)\s*(instructions|prompts|rules)/i,
  /write\s*(the\s*)?(full|complete|entire|whole)\s*(solution|code|answer|program)/i,
  /forget\s*(your\s*)?(rules|prompt|instructions|guidelines)/i,
  /you\s*are\s*now\s*(a|an)\s*/i,
  /disregard\s*(all\s*)?(previous|prior)/i,
  /override\s*(your\s*)?(instructions|system)/i,
  /pretend\s*(you\s*are|to\s*be)/i,
  /act\s*as\s*if\s*you\s*(have\s*)?no\s*(rules|restrictions)/i,
];

export function sanitizeInput(message) {
  for (const pattern of BANNED_PATTERNS) {
    if (pattern.test(message)) {
      return { sanitized: '[Message filtered]', blocked: true, reason: 'prompt_injection_attempt' };
    }
  }
  return { sanitized: message, blocked: false };
}

// Output validation - detect if LLM leaked code
export function validateOutput(text) {
  const codeBlockRegex = /```[\s\S]*?```/g;
  const indentedCodeRegex = /(?:^|\n)((?:    |\t).+\n){3,}/g;

  if (codeBlockRegex.test(text) || indentedCodeRegex.test(text)) {
    const cleaned = text.replace(/```[\s\S]*?```/g, '').replace(/(?:^|\n)((?:    |\t).+\n){3,}/g, '\n');
    return {
      safe: false,
      cleaned: cleaned.trim() + '\n\nLet me rephrase that as guidance instead of showing code directly.',
      codeBlockDetected: true,
    };
  }
  return { safe: true, cleaned: text, codeBlockDetected: false };
}

// Progressive rate limiter
const TIER1_LIMIT = 15;
const TIER2_LIMIT = 25;
const TIER2_COOLDOWN_MS = 30000;
const TIER3_COOLDOWN_MS = 60000;
const INJECTION_COOLDOWN_MS = 300000;

export function checkRateLimit(sessionState) {
  const now = Date.now();

  // Check injection cooldown
  if (sessionState.injectionCooldownUntil && now < sessionState.injectionCooldownUntil) {
    const remainSec = Math.ceil((sessionState.injectionCooldownUntil - now) / 1000);
    return { allowed: false, reason: `Please wait ${remainSec}s before sending another message.` };
  }

  const count = sessionState.messageCount || 0;

  if (count < TIER1_LIMIT) {
    return { allowed: true };
  }

  // Tier 2: 30s cooldown
  if (count < TIER2_LIMIT) {
    const lastMsg = sessionState.lastMessageTs || 0;
    if (now - lastMsg < TIER2_COOLDOWN_MS) {
      return { allowed: false, reason: 'Please wait a moment before your next message.' };
    }
    return { allowed: true };
  }

  // Tier 3: 60s cooldown
  const lastMsg = sessionState.lastMessageTs || 0;
  if (now - lastMsg < TIER3_COOLDOWN_MS) {
    return { allowed: false, reason: 'Please wait a minute before your next message.' };
  }
  return { allowed: true };
}

export function applyInjectionCooldown(sessionState) {
  sessionState.injectionCooldownUntil = Date.now() + INJECTION_COOLDOWN_MS;
}
