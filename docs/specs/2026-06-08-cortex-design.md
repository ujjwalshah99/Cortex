# Cortex -- AI-Assisted Coding Interview Platform

## Design Specification

**Date:** 2026-06-10
**Status:** Draft (v2)
**Based on:** innov8 codebase + enhanced system design document

---

## 1. Project Overview

Cortex is a real-time AI coding interviewer. It behaves like a real human interviewer sitting next to the candidate -- watching them code, noticing when they're stuck, asking probing questions to guide their thinking, answering questions when asked, and writing an evaluation when the interview is over.

The candidate experiences a natural interview conversation. Cortex never says "Would you like a hint?" -- it just interviews. It asks "What data structure would give you O(1) lookups here?" the same way a human interviewer would. The candidate can also ask Cortex anything, just like talking to a real interviewer: "Can you help me think through this?" or "Am I on the right track?"

Behind the scenes, a 3-tier detection pipeline (Heuristics -> SLM -> LLM) determines when and how to intervene -- but the candidate never sees the machinery. They just see an interviewer who is attentive, helpful, and fair.

### Core Objectives

- **Realistic Interview Experience:** The AI should feel like a human interviewer -- empathetic, probing, never robotic.
- **Cost Efficiency:** Minimize expensive LLM calls using the 3-tier detection pipeline.
- **Real-Time Responsiveness:** The coding interface must remain lag-free despite continuous background analysis.
- **Self-Improving:** An RL feedback loop tunes detection accuracy over time based on whether the interviewer's interventions led to candidate progress.
- **Zero Cost Hosting:** Entire platform runs on Oracle Cloud Free Tier (4 ARM cores, 24GB RAM).
- **Single Process:** One consolidated Node.js server.

---

## 2. Technology Stack

| Layer | Technology |
|---|---|
| **Runtime** | Node.js (v20+) |
| **Framework** | Express.js |
| **Real-Time** | Socket.io (WebSocket with auto-fallback) |
| **Frontend** | React 18 + TypeScript |
| **Code Editor** | Monaco Editor (@monaco-editor/react) |
| **Database** | MongoDB Atlas Free Tier (connection string, database: `cortex`) |
| **ODM** | Mongoose |
| **LLM** | Google Gemini Flash via `@google/generative-ai` SDK |
| **Diffing** | `diff-match-patch` npm package |
| **Code Execution** | Docker containers (sandboxed, per-language) |
| **Charts** | Chart.js + react-chartjs-2 |
| **Deployment** | Oracle Cloud Free Tier ARM VM |
| **Reverse Proxy** | Nginx + Let's Encrypt (SSL) |
| **Project Structure** | Monorepo (client + server in one repo) |

---

## 3. Project Structure

```
cortex/
  package.json
  .env.example
  nginx.conf
  build-images.sh
  docker/
    python/Dockerfile
    node/Dockerfile
    java/Dockerfile
    c/Dockerfile
    cpp/Dockerfile
  src/
    server/
      index.js                    # Entry point: Express + Socket.io + static serving
      config/
        defaults.js               # Default heuristic weights, thresholds, limits
        questions.json            # Question bank
      db/
        connection.js             # Mongoose connection with retry
        models/
          Session.js              # sessions collection schema
          Snapshot.js             # snapshots collection schema
          ChatLog.js             # chat_logs collection schema
          RLFeedback.js          # rl_feedback collection schema
      routes/
        execution.js              # POST /api/run, POST /api/check, POST /api/submit
        sessions.js               # Session CRUD + event ingestion
        questions.js              # GET /api/questions
        analytics.js              # GET /api/sessions, GET /api/session/:id
      services/
        sessionManager.js         # In-memory session state + buffered MongoDB persistence (flush every 5-10s)
        heuristicEngine.js        # Tier 1: Stuck Index calculator
        slmGateway.js             # Tier 2: Gemini Flash classification call
        interviewerBrain.js       # Tier 3: The interviewer's LLM engine (priority queue + prompt assembly + response generation)
        codeRunner.js             # Docker sandbox execution
        testCaseRunner.js         # Template wrapping + test case validation
        containerPool.js          # Docker container pre-warming + pooling
        rlFeedbackLogger.js       # RL data logging + observation periods
        promptGuard.js            # Input sanitization + output validation
        timerService.js           # Per-session timer management
        summaryGenerator.js       # Post-session interview summary via LLM
      socket/
        handler.js                # Socket.io event handlers (telemetry, interviewer messages, code runs)
      utils/
        gemini.js                 # Gemini API wrapper (single instance) + fallback logic
        sanitize.js               # Prompt injection detection
        diffPatch.js              # diff-match-patch wrapper
    client/
      public/
        index.html
        favicon.ico
      src/
        App.tsx                   # Root component with routing
        api.ts                    # REST API client
        socket.ts                 # Socket.io client wrapper
        components/
          QuestionPanel.tsx       # Left pane: problem display
          CodeEditor.tsx          # Middle top: Monaco editor
          OutputPanel.tsx         # Middle bottom: output + test results
          InterviewerPanel.tsx    # Right pane: conversation with Cortex (the interviewer)
          TimerBar.tsx            # Timer + progress bar
          ReplayPlayer.tsx        # Session replay controls
          CandidateEntry.tsx      # Pre-interview name/email entry screen
        hooks/
          useTelemetry.ts         # Keystroke capture, line metrics, paste detection, batching
          useSessionRecovery.ts   # localStorage + hydration on reconnect
          useKeyboardShortcuts.ts # Ctrl+Enter, Ctrl+Shift+Enter, etc.
          useTabVisibility.ts     # Tab focus/blur tracking
        services/
          telemetryEngine.ts      # Client-side metric computation
        views/
          EntryPage.tsx           # Candidate identification screen
          InterviewPage.tsx       # Main 3-pane interview layout
          AnalyticsListPage.tsx   # Session list with summaries
          AnalyticsDetailPage.tsx # Session detail + replay + charts
        styles/
          App.css
          analytics.css
      tsconfig.json
      craco.config.js
  docs/
    specs/
      2026-06-08-cortex-design.md   # This file
```

---

## 4. Database Schema

Single database: `cortex` hosted on MongoDB Atlas Free Tier (512MB, managed backups, built-in monitoring). Connected via connection string -- zero local Mongo installation needed. Four collections. Zero log files.

### 4.1 Collection: `sessions`

Stores all raw telemetry, line history, code submissions, and test results for a coding session.

```javascript
{
  sessionId:    String,        // UUID, indexed
  language:     String,        // "python" | "javascript" | "java" | "c" | "cpp"
  initialCode:  String,        // Code at session start (from canonical_skeleton)
  startTime:    Number,        // Unix ms
  endTime:      Number,        // Unix ms, set on stop/submit/timeout
  timeLimit:    Number,        // Max duration in ms (e.g., 2700000 for 45 min)
  difficulty:   String,        // "easy" | "medium" | "hard"
  questionId:   String,        // References question in questions.json
  status:       String,        // "active" | "submitted" | "timeout" | "abandoned"

  candidate: {                 // Candidate identification
    name:       String,        // Entered before interview starts
    email:      String         // Entered before interview starts
  },

  events: [{                   // Raw EDIT events for replay
    timestamp:  Number,        // Relative to startTime
    type:       String,        // "EDIT" | "PASTE"
    payload:    Mixed          // { changes: [...] } or { charCount, lineCount, text }
  }],

  lineHistory: {               // Map<lineNumber, Array<version>>
    "<lineNum>": [{
      timestamp:  Number,
      content:    String,      // Full line text at this version
      metrics: {               // Optional, present on LINE_METRICS events
        activeMs:       Number,
        idleMs:         Number,
        delayMs:        Number,
        delayOutlier:   Boolean,
        churnRatio:     Number,
        churnAdded:     Number,
        churnDeleted:   Number,
        undoCount:      Number,
        redoCount:      Number,
        keystrokeRate:  Number,
        idleFlag:       Boolean
      }
    }]
  },

  tabEvents: [{                // Tab visibility tracking
    timestamp:  Number,
    type:       String,        // "TAB_AWAY" | "TAB_RETURN"
    durationMs: Number         // How long candidate was away (set on TAB_RETURN)
  }],

  all_submissions: [{          // Every "Run Code" or "Submit" click
    code:        String,
    output:      String,
    error:       String,
    testResults: [{            // Per-test-case results
      testId:    String,       // "public-0", "hidden-2", etc.
      passed:    Boolean,
      input:     Mixed,
      expected:  Mixed,
      actual:    Mixed,        // null for hidden tests on non-submit runs
      executionTime: Number    // ms
    }],
    isSubmission: Boolean,     // true if "Submit", false if "Run"
    timestamp:   Number
  }],

  finalResults: {              // Set on submission
    publicPassed:  Number,
    publicTotal:   Number,
    hiddenPassed:  Number,
    hiddenTotal:   Number,
    allPassed:     Boolean
  },

  interviewSummary: {          // Auto-generated after session ends
    summary:     String,       // LLM-generated narrative summary
    strengths:   [String],     // Key strengths observed
    weaknesses:  [String],     // Areas for improvement
    rating:      String,       // "Strong Pass" | "Pass" | "Borderline" | "Fail"
    generatedAt: Date
  },

  meta: Mixed                  // { userAgent, ... }
}
```

### 4.2 Collection: `snapshots`

One document per 30-second SLM analysis snapshot. Used for debugging SLM accuracy and training data.

```javascript
{
  sessionId:      String,      // Indexed
  code:           String,      // Code at snapshot time
  metrics: {
    progressiveSeconds: Number, // 30, 60, 90, ...
    avgChurnRatio:      Number,
    failureStreak:      Number,
    stuckIndex:         Number, // S value from heuristic
    pasteCount:         Number, // Number of paste events so far
    tabAwayCount:       Number, // Number of tab-away events so far
    tabAwayTotalMs:     Number, // Total ms spent away from tab
    // ... any additional aggregated metrics
  },
  prompt:          String,     // Full user prompt sent to SLM
  systemPrompt:    String,     // System prompt sent to SLM
  response:        String,     // Raw SLM response text
  shouldCallLlm:   Boolean,    // Parsed from response, indexed
  reasoning:       String,     // Parsed from response
  fallbackUsed:    Boolean,    // true if Gemini API failed and fallback was used
  createdAt:       Date
}
```

### 4.3 Collection: `chat_logs`

One document per LLM chat invocation. Captures full prompt, response, and session state at that moment.

```javascript
{
  sessionId:      String,      // Indexed
  trigger:        String,      // "CANDIDATE_MESSAGE" | "CODE_RUN" | "PROACTIVE_GUIDANCE"
  priority:       Number,      // 3, 2, or 1
  prompt:         String,      // Full assembled prompt
  rawResponse:    String,      // Raw LLM response
  extractedJson: {             // Parsed output
    output_chat:  String
  },
  helpLevel:      Number,      // 0-3, after this turn
  struggleScore:  Number,      // 0-100, after this turn
  userMessage:    String,      // null for system-triggered events
  codeSnapshot:   String,      // Code at time of call
  codeBlockDetected: Boolean,  // true if output validation caught leaked code
  fallbackUsed:   Boolean,     // true if Gemini failed and hint_template was used directly
  createdAt:      Date
}
```

### 4.4 Collection: `rl_feedback`

One document per hint interaction. Feeds the weight-tuning flywheel.

```javascript
{
  sessionId:          String,   // Indexed
  stuckIndex:         Number,   // S value when interviewer intervened
  slmShouldCallLlm:  Boolean,  // SLM's decision
  interviewerMessage: String,   // What the interviewer said
  helpLevel:          Number,   // 0-3, level of guidance given
  candidateResponse:  String,   // "engaged" | "silent_progressed" | "silent_stuck" | "asked_more_help"
  observationWindowMs: Number,  // Duration of observation (ms)
  postOutcome:        String,   // "progressed" | "still_stuck" | null (pending)
  reward:             Number,   // +1, 0, or -1
  weightsAtTime:      [Number], // [w1, w2, w3, w4, w5, w6, w7]
  thresholdAtTime:    Number,   // T value when interviewer intervened
  problemDifficulty:  String,   // "easy" | "medium" | "hard"
  problemId:          String,
  createdAt:          Date,
  resolvedAt:         Date      // When postOutcome was determined
}
```

---

## 5. Architectural Components

### 5.1 Real-Time Transport: Socket.io

Bidirectional WebSocket connection between client and server.

**Client -> Server events:**

| Event | Payload | Purpose |
|---|---|---|
| `telemetry` | `{ edits[], lineUpdates[], lineMetrics[], pasteEvents[] }` | Batched telemetry (every ~350ms) |
| `telemetry-meta` | `{ type: "TAB_AWAY" or "TAB_RETURN", timestamp }` | Tab visibility change |
| `chat-message` | `{ text, sessionId }` | Candidate talks to the interviewer |
| `run-code` | `{ language, code, sessionId }` | Run button clicked (or Ctrl+Enter) |
| `submit-code` | `{ language, code, sessionId }` | Submit button clicked (or Ctrl+Shift+Enter) |
| `reconnect-session` | `{ sessionId }` | Page refresh with existing session |
| `start-session` | `{ candidateName, candidateEmail, language }` | Candidate enters name/email and starts |

**Server -> Client events:**

| Event | Payload | Purpose |
|---|---|---|
| `session-created` | `{ sessionId, question, initialCode, timeLimit }` | Session initialized, interview begins |
| `interviewer-message` | `{ text, trigger }` | Interviewer speaks (proactive guidance, response to candidate, or code-run commentary) |
| `run-result` | `{ output, error, testResults }` | Code execution results |
| `submit-result` | `{ output, error, testResults, finalResults }` | Submission results with hidden tests |
| `timer-sync` | `{ elapsed, remaining, percent }` | Timer update (every 10s) |
| `session-restored` | `{ code, language, startTime, chatHistory, helpLevel, struggleScore, candidate }` | Full hydration on reconnect |
| `session-timeout` | `{}` | Time limit reached |
| `next-question` | `{ question, initialCode }` | After successful submission, next problem loaded |
| `session-ended` | `{ interviewSummary }` | Session complete, summary available |

**MongoDB Write Buffering:**

Telemetry arrives via WebSocket every ~350ms, but writing to Atlas on every batch would create ~170 writes/minute per session -- unnecessary load on the free tier. Instead, a two-layer approach is used:

```
Client (every 350ms) → WebSocket → Server IN-MEMORY session state (instant)
                                            ↓
                                    MongoDB flush (every 5-10 seconds)
```

- **Layer 1 (real-time):** WebSocket telemetry is immediately applied to the in-memory session state. The heuristic engine reads from this in-memory state. Zero latency.
- **Layer 2 (persistence):** A server-side buffer accumulates events and flushes to MongoDB every 5-10 seconds using a single batched `$push` operation. This reduces writes from ~170/min to ~10/min per session.
- **On session end:** All remaining buffered events are force-flushed to MongoDB before the session is closed.
- **On server crash:** At most 5-10 seconds of telemetry data is lost. The code snapshot from the last 30s snapshot loop is still in MongoDB, so session recovery still works. Only fine-grained EDIT events for replay may have a small gap.

### 5.2 Tier 1: Heuristic Engine

A pure math module. No API calls. Runs synchronously on every telemetry batch.

**Inputs (from in-memory session state):**

| Signal | Variable | Weight |
|---|---|---|
| Normalized idle time (last 60s) | `normIdleTime` | `w1` (default: 0.15) |
| Average churn ratio (last 60s) | `normChurnRatio` | `w2` (default: 0.25) |
| Execution failure streak | `failureStreak` | `w3` (default: 0.20) |
| Delay outlier frequency (last N edits) | `delayOutlierFreq` | `w4` (default: 0.10) |
| Undo frequency (last 60s) | `undoFrequency` | `w5` (default: 0.10) |
| Keystroke rate drop vs rolling avg | `keystrokeRateDrop` | `w6` (default: 0.10) |
| Same-line oscillation count | `sameLineOscillation` | `w7` (default: 0.10) |

**Formula:**

```
S = (w1 * normIdleTime) + (w2 * normChurnRatio) + (w3 * failureStreak)
  + (w4 * delayOutlierFreq) + (w5 * undoFrequency) + (w6 * keystrokeRateDrop)
  + (w7 * sameLineOscillation)
```

All inputs are normalized to 0-100 scale before weighting. S is on a 0-100 scale.

**Thresholds T (per difficulty):**

| Difficulty | Threshold T | Meaning |
|---|---|---|
| Easy | 70 | Higher bar -- easier problems, more patience |
| Medium | 55 | Moderate sensitivity |
| Hard | 40 | Lower bar -- hard problems, earlier intervention |

**Rules:**

- **Cold start grace period:** Heuristic is DISABLED for the first 90 seconds. During this period, the 30s snapshot loop still runs but only persists data to MongoDB (no SLM calls). If the candidate types nothing for 2+ minutes at the start, the system makes a single SLM call with context "candidate has not started coding yet."
- **Anti-spam:** Minimum 60 seconds between escalations.
- **"Thinking vs Stuck" differentiation:**
  - THINKING: Long idle followed by low-churn burst (< 1.3), new lines added, zero undos. Recovery signals cancel idle signal, S stays low.
  - STUCK: Frequent short idles + high churn (> 2.0), same lines re-edited, undos increasing, failed runs with same error. S crosses threshold.

**Additional signals (informational, not weighted):**

- Paste events: Large paste (> 50 chars with newlines) logged as `PASTE` event. Visible in analytics. Included in SLM context but not in heuristic formula (pasting is not "struggling").
- Tab-away events: Logged with duration. Included in SLM context. Long tab-away resets idle accumulation (candidate was not staring at editor).

### 5.3 Tier 2: SLM Gatekeeper

Lightweight Gemini Flash classification call. NOT called every 30 seconds -- that would burn through the free API tier (15 RPM limit). Instead, triggered conditionally:

1. **On heuristic threshold breach** (S >= T, event-driven)
2. **On warm zone entry** (S >= T - 15, checked every 30s snapshot cycle) -- the heuristic is close to firing but hasn't crossed the threshold yet. SLM is called to confirm whether the candidate is genuinely struggling before the heuristic fully triggers.

**The 30-second snapshot loop runs SERVER-SIDE** (not client-initiated). Since the server already has the current code and all metrics in memory via WebSocket telemetry, there's no need for the client to send a separate snapshot. Every 30 seconds, the server:
- Reads current code + metrics from its own in-memory session state
- Computes Stuck Index S via heuristic engine (pure math, free, < 5ms)
- Persists snapshot data to MongoDB (code, metrics) for analytics

It only calls the SLM when S enters the warm zone (S >= T - 15) or crosses the threshold (S >= T). A typical 45-minute session makes **5-10 SLM calls total**, not 90.

**Input:** Condensed state log containing:
- Current code snapshot
- Stuck Index S and component values
- Aggregated metrics (including pasteCount, tabAwayCount, tabAwayTotalMs)
- Recent errors from last 3 runs
- Line history (last 3 versions per problem line, up to 50 lines)
- Question text
- Progressive seconds

**System prompt:** Instructs the model to analyze step-by-step and output:
```json
{ "should_call_llm": true, "reasoning": "Step 1: ... Step 2: ..." }
```

**On `should_call_llm = true`:** Enqueue SLM event to priority queue (priority: 1).
**On `should_call_llm = false`:** Log as false positive if heuristic-triggered. Bump cooldown.

**Gemini API Fallback:**
If the Gemini API call fails (timeout, rate limit, network error):
- SLM: If heuristic confidence is high (S > T + 15), skip SLM validation and proceed directly to hint delivery using `hint_templates` from question JSON (no personalization).
- If borderline (S in warm zone but not above T), skip this cycle and wait for next warm zone check.
- Log: `{ fallbackUsed: true }` in snapshot doc.

**Logging:** Full prompt + response + parsed fields saved to `snapshots` collection.

### 5.4 Tier 3: The Interviewer Brain (LLM Engine)

Gemini Flash powers the interviewer's voice. It handles two scenarios: (A) the interviewer proactively engages when it detects struggle, and (B) the interviewer responds when the candidate talks to it. In both cases, the candidate experiences a natural conversation with their interviewer -- not a hint system.

**Priority Queue (in-memory, per session):**

| Priority | Event Type | Source |
|---|---|---|
| 3 (highest) | `CANDIDATE_MESSAGE` | Candidate asks the interviewer something |
| 2 | `CODE_RUN` | Candidate runs code -- interviewer may comment on results |
| 1 (lowest) | `PROACTIVE_GUIDANCE` | Interviewer decides to proactively engage (triggered by SLM) |

Processing: Dequeue highest priority -> build prompt -> call Gemini -> push response to client.

**CODE_RUN Smart Filtering:**

A real interviewer doesn't comment after every single code run. They react when something interesting happens. The system only triggers interviewer commentary when something meaningful changes:

| Condition | Interviewer Reacts? | Example Response |
|---|---|---|
| First run of the session | Yes | "Let's see how that runs..." |
| First successful run after 2+ failures | Yes | "Nice, looks like you got past that error!" |
| New error type (different from previous) | Yes | "Interesting -- different error now. What do you think changed?" |
| Test pass count changed | Yes | "Good progress, two more tests passing now." |
| Same error as last run | No | (Interviewer stays quiet, candidate already knows) |
| Same test results as last run | No | (No new information to discuss) |
| Successful run after successful run | No | (Candidate is iterating, don't interrupt) |

This reduces LLM calls from ~20-30 per session to ~5-8.

**Tiered Context Assembly (per trigger type):**

Not every LLM call needs the full context. Sending 4500+ tokens on every call wastes the free tier. Context is trimmed based on trigger type:

**CANDIDATE_MESSAGE (full context -- candidate asked, interviewer gives best answer):**

1. System prompt (Cortex interviewer persona)
2. Session memory: `help_level` (0-3), `struggle_score` (0-100)
3. Question JSON
4. Hint templates from question (`nudge`, `guide`, `direction`) -- matched to current `help_level`
5. Instruction: "Use the hint template matching current help_level as your BASE. Personalize based on the candidate's code."
6. Conversation history (last 10 turns from `chat_logs`)
7. Current code snapshot
8. Recent runs + errors (last 3 from `all_submissions`)
9. Line history (last 3 versions per line, up to 50 lines)
10. Timer context: elapsed time, remaining time, urgency flag
11. Paste/tab-away context: "Candidate pasted code N times. Switched tabs M times (total Xs away)."
12. ~4500 tokens

**CODE_RUN (minimal -- interviewer briefly reacts to the run result):**

1. System prompt (Cortex interviewer persona)
2. Session memory: `help_level`, `struggle_score`
3. Current code snapshot
4. This run's output/error + previous run's output/error (for comparison)
5. Test results (pass/fail per case)
6. Timer context
7. ~1500 tokens

**PROACTIVE_GUIDANCE (interviewer initiates -- focused on guiding the candidate):**

1. System prompt (Cortex interviewer persona)
2. Session memory: `help_level`, `struggle_score`
3. Hint templates (matched to current `help_level`)
4. Current code snapshot
5. Aggregated struggle metrics (churnRatio, failureStreak, etc.)
6. Timer context
7. ~2000 tokens

This cuts token usage by ~40-60% on CODE_RUN and SLM triggers.

**Output format:** `{ "output_chat": "...text to display in chat..." }`

**help_level and struggle_score management:**

These are NOT determined by the LLM. The LLM receives them as inputs but does not set them. They are driven by the server-side heuristic engine:

```
struggle_score = Stuck Index S (0-100, computed by heuristic engine)

help_level is derived from struggle_score:
  S < 25          → help_level = 0 (no guidance needed)
  25 <= S < 50    → help_level = 1 (nudge — probing questions)
  50 <= S < 75    → help_level = 2 (guide — explain approach)
  S >= 75         → help_level = 3 (direction — walk through step by step)
```

The LLM's system prompt includes: "You are at guidance level {help_level}. Match your depth of help to this level." The LLM follows this instruction but does not decide the level itself.

**Gemini API Fallback (Tier 3):**
If the Gemini API call fails during proactive guidance:
- Fall back to serving the raw `hint_template` text from question JSON (matching current `help_level`) as if the interviewer said it.
- Template is sent as-is to the chat panel.
- Log: `{ fallbackUsed: true }` in `chat_logs` doc.
- If API fails when candidate speaks to the interviewer: respond with "Sorry, I missed that -- could you say that again?" and retry on next message.

**Logging:** Full prompt + response + extracted JSON + state saved to `chat_logs` collection.

### 5.5 Output Validation Layer

Runs AFTER every LLM response, BEFORE sending to the candidate.

**Code leak detection:**

```javascript
function validateOutput(text, candidateCode) {
  // Check for code blocks with 3+ lines
  const codeBlockRegex = /```[\s\S]*?```/g;
  const indentedCodeRegex = /(?:^|\n)((?:    |\t).+\n){3,}/g;

  const hasCodeBlock = codeBlockRegex.test(text);
  const hasIndentedCode = indentedCodeRegex.test(text);

  if (hasCodeBlock || hasIndentedCode) {
    return {
      safe: false,
      cleaned: stripCodeBlocks(text) +
        "\n\nLet me rephrase that as a hint instead of showing code directly.",
      codeBlockDetected: true
    };
  }

  return { safe: true, cleaned: text, codeBlockDetected: false };
}
```

If code is detected: strip it, append disclaimer, log the incident in `chat_logs.codeBlockDetected = true`.

### 5.6 Prompt Injection Guard

Runs on every user chat message BEFORE it enters the prompt.

**Input sanitization:**

```javascript
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

function sanitizeInput(message) {
  for (const pattern of BANNED_PATTERNS) {
    if (pattern.test(message)) {
      return {
        sanitized: "[Message filtered]",
        blocked: true,
        reason: "prompt_injection_attempt"
      };
    }
  }
  return { sanitized: message, blocked: false };
}
```

If blocked: return a polite refusal ("Let's focus on the coding problem!"). Apply 5-minute chat cooldown. Log the attempt.

### 5.7 Rate Limiter (Progressive)

Per-session message throttling. Prevents abuse without punishing genuine engagement.

| Message Count | Rule |
|---|---|
| 1-15 | No limit |
| 16-25 | 30-second cooldown between messages |
| 26+ | 60-second cooldown between messages |
| After injection attempt | 5-minute cooldown |

Cooldown is per-session, resets if session is idle for 5+ minutes.

### 5.8 Code Execution Engine

Docker sandbox for running candidate code. Inherited from innov8 with security hardening.

**Per-language configuration:**

| Language | Image | Filename | Timeout |
|---|---|---|---|
| Python | `python:3.9-custom` | `main.py` | 10s |
| JavaScript | `node:18-custom` | `main.js` | 10s |
| Java | `openjdk:11-custom` | `Main.java` | 15s |
| C | `gcc:latest-custom` | `main.c` | 15s |
| C++ | `gcc:latest-custom` | `main.cpp` | 15s |

**Docker flags:**
```
--rm --cpus=0.5 --memory=256m --network=none --pids-limit=50
```

### 5.9 Container Pre-Warming + Pooling

Reduces Docker cold-start latency from 2-5s to < 1s.

**On server startup:**
```javascript
// Pre-pull and warm all language images
async function warmContainers() {
  const languages = ['python:3.9-custom', 'node:18-custom',
                     'openjdk:11-custom', 'gcc:latest-custom'];
  for (const image of languages) {
    // Run a no-op command to warm the image layers in Docker cache
    exec(`docker run --rm ${image} echo "warm"`, { timeout: 30000 });
  }
}
```

**Optional pool (if RAM permits):**
- Keep 1 idle container per language alive using `--entrypoint sleep` with a 5-minute timeout.
- On code run: `docker exec` into the warm container instead of `docker run`.
- On container expiry: respawn a new warm container in the background.
- Each warm container uses ~50-80MB RAM. With 24GB available, this is negligible.
- Falls back to cold `docker run` if pool is empty.

### 5.10 Test Case Runner

Runs candidate code against public and hidden test cases using template wrapping.

**How it works:**

1. Question JSON contains `canonical_skeleton` defining expected function signature:
   ```
   "canonical_skeleton": "def two_sum(nums: list[int], target: int) -> list[int]:"
   ```

2. When question loads, editor is pre-populated with the skeleton:
   ```python
   def two_sum(nums, target):
       # Write your solution here
       pass
   ```
   This guarantees the function name matches the test harness.

3. System wraps the candidate's code with a test harness that runs ALL test cases in a single Docker invocation (not one container per test):
   ```python
   # --- Candidate's code (pasted as-is) ---
   def two_sum(nums, target):
       seen = {}
       for i, n in enumerate(nums):
           ...

   # --- Auto-generated test harness (runs ALL tests in one process) ---
   import json, sys, time

   _tests = json.loads(sys.stdin.read())  # Array of test inputs
   _results = []
   for _t in _tests:
       _start = time.time()
       try:
           _out = two_sum(_t["nums"], _t["target"])
           _results.append({"output": _out, "error": None,
                            "time_ms": round((time.time() - _start) * 1000)})
       except Exception as _e:
           _results.append({"output": None, "error": str(_e),
                            "time_ms": round((time.time() - _start) * 1000)})
   print(json.dumps(_results))
   ```

4. The full array of test inputs is piped via stdin as JSON. One Docker run executes all tests. Server parses the JSON array output and compares each result against expected output (JSON equality, order-insensitive for arrays where specified).

   This is critical for performance: a question with 8 test cases takes **1-3 seconds total** (one container) instead of 8-24 seconds (one container per test).

**Test result visibility:**

| Test Type | On "Run Code" | On "Submit" |
|---|---|---|
| Public tests | Full details: input, expected, actual | Full details |
| Hidden tests | Not run | Pass/fail count only (no details) |

### 5.11 Session Recovery (Full Hydration)

On page refresh or reconnect:

1. Client checks `localStorage.cortex_sessionId`
2. If found: emits `reconnect-session` via Socket.io
3. Server responds with `session-restored` event containing:
   - `code`: Latest code (from last snapshot or LINE_UPDATE)
   - `language`: Session language
   - `startTime`: Original start time (timer resumes correctly)
   - `timeLimit`: Original time limit
   - `chatHistory`: Last 10 messages from `chat_logs` collection
   - `helpLevel`: Current help_level
   - `struggleScore`: Current struggle_score
   - `testResults`: Last submission's test results (if any)
   - `questionId`: Current question
   - `candidate`: { name, email }

4. Heuristic engine rebuilds state from:
   - `lineHistory` in session doc -> reconstruct churn metrics
   - `all_submissions` -> reconstruct failure streak
   - `tabEvents` -> reconstruct tab-away counters

5. Cortex sends a reconnection message in chat:
   "Welcome back! Let's continue where we left off."

6. On session end (submit/timeout/close): `localStorage.removeItem('cortex_sessionId')`

### 5.12 Timer Service

Per-session countdown timer.

**Server-side:**
- Stores `startTime` and `timeLimit` per session
- Pushes `timer-sync` event every 10 seconds: `{ elapsed, remaining, percent }`
- At 80% time: sets `urgencyFlag = true` in LLM context
- At 100% time: emits `session-timeout`, sets `status = "timeout"`, triggers summary generation, saves session

**Client-side:**
- Displays elapsed / total + progress bar
- Visual styling changes:
  - 0-60%: Normal (neutral color)
  - 60-80%: Caution (yellow)
  - 80%+: Urgent (red, subtle pulse animation)

**LLM context injection:**
- Always: "Elapsed: MM:SS, Remaining: MM:SS"
- At 80%+: "IMPORTANT: The candidate is running low on time. Factor this into your guidance. Suggest focusing on a working solution before optimizing."

### 5.13 Submit and Completion Flow

**Submit button** (distinct from Run):

1. Candidate clicks "Submit Solution" (or Ctrl+Shift+Enter)
2. Code runs against ALL test cases (public + hidden)
3. Results saved to `all_submissions` with `isSubmission: true`
4. `finalResults` computed and saved to session:
   ```javascript
   { publicPassed: 3, publicTotal: 3, hiddenPassed: 4, hiddenTotal: 5, allPassed: false }
   ```
5. If more problems in the interview set:
   - Show results summary
   - After 5 seconds: load next problem via `next-question` event
   - Reset code editor with new question's `canonical_skeleton`
   - Timer continues (or resets per config)
6. If last problem:
   - Show final summary
   - Set `status = "submitted"`
   - Trigger interview summary generation
   - End session

### 5.14 Candidate Identification

Entry screen before the interview -- like walking into the interview room and introducing yourself. No authentication system.

**Flow:**

1. Candidate opens interview URL
2. `EntryPage.tsx` renders the entry screen (see Section 9)
3. Candidate enters name and email, clicks "Enter Interview Room"
4. Client emits `start-session` with `{ candidateName, candidateEmail, language }`
5. Server creates session with `candidate: { name, email }`
6. Client receives `session-created` event -> navigates to `InterviewPage`
7. The interviewer greets the candidate by name:
   ```
   Cortex: "Hi John, I'm Cortex. I'll be your interviewer today.
   We have 45 minutes together. Take a moment to read the problem
   on the left, and start coding whenever you're ready. Feel free
   to talk to me anytime -- ask questions, think out loud, or
   just let me know if you'd like some guidance. Good luck!"
   ```
8. Timer starts. Interview begins.

**Validation:** Name is required. Email is optional but encouraged.

### 5.15 Copy-Paste Detection

Detects and logs large paste events as a proctoring signal.

**Client-side detection (in `useTelemetry.ts`):**

```javascript
// Inside Monaco onDidChangeContent handler
for (const change of e.changes) {
  const text = change.text || '';
  const isLargePaste = text.length > 50 && text.includes('\n');

  if (isLargePaste) {
    pasteEvents.push({
      timestamp: relativeTimestamp,
      type: 'PASTE',
      payload: {
        charCount: text.length,
        lineCount: text.split('\n').length,
        text: text.substring(0, 500)  // Truncate for storage
      }
    });
  }
}
```

**Server-side:**
- Stored in `session.events` alongside EDIT events
- Paste count included in SLM context: "Candidate has pasted code N times"
- Paste events highlighted in analytics replay timeline
- NOT used in heuristic formula (pasting is not "struggling")

### 5.16 Tab Visibility Tracking

Tracks when the candidate switches away from the interview tab.

**Client-side (in `useTabVisibility.ts`):**

```javascript
document.addEventListener('visibilitychange', () => {
  const timestamp = Date.now() - sessionStartTime;
  if (document.hidden) {
    socket.emit('telemetry-meta', { type: 'TAB_AWAY', timestamp });
  } else {
    socket.emit('telemetry-meta', { type: 'TAB_RETURN', timestamp });
  }
});
```

**Server-side:**
- Stored in `session.tabEvents` with duration calculated on TAB_RETURN
- Included in SLM context: "Candidate switched tabs M times (total Xs away)"
- Shown in analytics timeline as highlighted bands
- Long tab-away (> 30s) resets idle accumulation in heuristic engine (candidate was not staring at editor, so idle metric should not count)

### 5.17 Keyboard Shortcuts

Essential shortcuts for a coding platform.

| Shortcut | Action | Component |
|---|---|---|
| `Ctrl+Enter` / `Cmd+Enter` | Run Code | CodeEditor |
| `Ctrl+Shift+Enter` / `Cmd+Shift+Enter` | Submit Solution | CodeEditor |
| `Escape` | Focus editor (from chat panel) | Global |
| `Ctrl+/` / `Cmd+/` | Toggle line comment | Monaco built-in |

**Implementation (in `useKeyboardShortcuts.ts`):**

```javascript
useEffect(() => {
  const handler = (e: KeyboardEvent) => {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key === 'Enter' && e.shiftKey) {
      e.preventDefault();
      onSubmit();
    } else if (mod && e.key === 'Enter') {
      e.preventDefault();
      onRun();
    } else if (e.key === 'Escape') {
      editorRef.current?.focus();
    }
  };
  window.addEventListener('keydown', handler);
  return () => window.removeEventListener('keydown', handler);
}, [onRun, onSubmit]);
```

### 5.18 Interview Summary Auto-Generation

After a session ends (submit, timeout, or abandon), auto-generate a brief narrative summary using one final LLM call.

**Trigger:** Called by `summaryGenerator.js` when session status changes to "submitted", "timeout", or "abandoned".

**LLM receives:**
- Final code snapshot
- Test results (public + hidden pass/fail)
- Struggle score trajectory (from snapshots collection)
- Interviewer interventions and candidate responses (from rl_feedback)
- Key struggle moments (lines with highest churn from lineHistory)
- Total time used vs time limit
- Paste count and tab-away count
- Candidate name

**LLM generates:**

```json
{
  "summary": "John solved Two Sum using a hash map approach in 18 minutes. He struggled initially with the lookup logic (lines 4-6, high churn for ~3 min). I asked him about O(1) lookup data structures, and he quickly connected it to hash maps. After that guidance, he solved it within 4 minutes. All public tests passed, 4/5 hidden tests passed. The failing hidden test involved negative numbers -- he didn't consider that edge case.",
  "strengths": ["Good problem decomposition", "Efficient solution (O(n))", "Responded well to guidance"],
  "weaknesses": ["Initially tried brute force before considering optimization", "Missed edge case with negative numbers"],
  "rating": "Pass"
}
```

**Rating scale:**
- **Strong Pass:** Solved independently with minimal guidance, efficient solution, good communication
- **Pass:** Solved with some guidance, demonstrated understanding, recovered well from mistakes
- **Borderline:** Needed significant interviewer guidance to reach a solution, or partial solution only
- **Fail:** Could not produce a working solution even with heavy guidance, or fundamental gaps in understanding

**Storage:** Saved to `session.interviewSummary`

**Fallback:** If Gemini API fails, generate a basic summary from raw data (no LLM):
```json
{
  "summary": "Session completed. 3/3 public tests passed, 4/5 hidden tests passed. Interviewer intervened 2 times. Time used: 18:34 of 45:00.",
  "strengths": [],
  "weaknesses": [],
  "rating": "Data-only summary (LLM unavailable)"
}
```

---

## 6. How the Interviewer Behaves

Cortex is the interviewer. It does not ask "Would you like a hint?" -- that's robotic. It behaves like a real human interviewer would.

### Two Modes of Interaction:

**A) Candidate talks to the interviewer (candidate-initiated):**

The candidate can type anything in the chat panel at any time, just like talking to a human interviewer:

| Candidate Says | Interviewer Responds Like |
|---|---|
| "Can you give me a hint?" | Gives guidance matched to current `help_level` |
| "Am I on the right track?" | Evaluates their current approach honestly |
| "I'm stuck, I don't know where to start" | Asks probing questions to understand their thinking, then guides |
| "What's the time complexity of my solution?" | Discusses complexity, may suggest improvements |
| "Should I use a hash map here?" | Responds like a real interviewer -- "What makes you think a hash map would help?" |

**B) Interviewer proactively engages (system-initiated):**

When the 3-tier detection pipeline confirms the candidate is struggling, the LLM generates a natural interviewer response. The interviewer doesn't announce that it detected struggle -- it just acts like a human interviewer who noticed something:

| help_level | Interviewer Style | Example |
|---|---|---|
| 1 (nudge) | Asks a probing question | "I see you're iterating through the array. What if you could check whether a number exists in O(1) instead of scanning the whole array each time?" |
| 2 (guide) | Explains the approach direction | "One common technique here is to use a hash map. As you iterate, you can store each number you've seen. Then for each new number, you check if its complement is already in the map." |
| 3 (direction) | Walks through step by step | "Let me walk you through the approach. First, create an empty dictionary. Then loop through the array with enumerate to get both index and value. For each value, compute target minus that value -- that's your complement. Check if the complement is in your dictionary..." |

The `hint_templates` from the question JSON serve as the **base** for the LLM's response at each level. The LLM personalizes them based on the candidate's actual code and where they're specifically stuck.

### What Happens After the Interviewer Speaks:

The interviewer's proactive message is just a chat message. The candidate can:
- **Respond** ("Oh, a hash map! Let me try that") -> natural conversation continues
- **Ask a follow-up** ("What do you mean by complement?") -> interviewer explains further
- **Keep coding silently** -> interviewer stays quiet and monitors

There is no "accepted/declined" flow. The interviewer spoke, the candidate heard it. What matters is whether the candidate makes progress afterward -- and that's what the RL feedback loop tracks (see Section 7).

### Interviewer Escalation:

The interviewer naturally becomes more helpful over time if the candidate continues to struggle:
- `help_level` starts at 0 and increases as `struggle_score` rises
- The LLM's system prompt includes: "You are at guidance level {help_level}. Match your depth of help to this level."
- The candidate doesn't see these numbers -- they just experience an interviewer who gradually offers more specific guidance

### Maximum Struggle (help_level = 3, struggle_score >= 70):

The interviewer does NOT switch problems. The interview has a fixed problem set. Instead:
- The interviewer gives the most direct guidance possible -- walking through the algorithm step by step
- Still never writes code for the candidate
- The interview summary will capture the level of assistance needed
- A candidate who solved with heavy guidance gets a "Borderline" or "Fail" rating

### Time Awareness:

The interviewer is aware of the clock:
- At 80%+ time used, the interviewer may say: "We're getting close on time. Let's focus on getting a working solution -- we can discuss optimization after."
- This is natural -- real interviewers do this too.

---

## 7. RL Feedback Loop

### Data Collection:

Every time the interviewer proactively speaks (triggered by the detection pipeline, not by the candidate asking), an `rl_feedback` document is created.

### Reward Assignment:

Since there's no "accepted/declined" button, the system measures whether the interviewer's intervention **led to progress**:

| What Happened After Interviewer Spoke | Reward | Interpretation |
|---|---|---|
| Candidate made progress within 3 min (new tests passing, successful run, lower churn) | +1 | Correct detection, helpful guidance |
| Candidate responded and engaged in conversation, then progressed | +1 | Correct detection, conversation helped |
| Candidate kept coding silently and progressed (was already fine) | -1 | False positive -- interviewer interrupted unnecessarily |
| Candidate kept coding silently and stayed stuck | 0 (neutral) | Correct detection but guidance didn't land -- may need different approach |
| Candidate asked for MORE help after interviewer spoke | +1 | Correct detection, candidate needed even more guidance |

### Observation Window:

- Duration: 3 minutes after interviewer's proactive message (configurable)
- "Progress" defined as: successful code run, 1+ new test passing, or significant new code with low churn
- "Still stuck" defined as: same errors, high churn continuing, or no successful run

### Weight Tuning (periodic):

Runs after every N sessions (default: 20) or daily, whichever comes first.

1. Aggregate all `rl_feedback` docs since last tuning
2. Compute accuracy metrics:
   - True positive rate: hints offered AND user was genuinely stuck
   - False positive rate: hints offered BUT user was fine
3. Adjust weights using exponential moving average:
   ```
   For each weight wi:
     If false_positive_rate > 0.3: wi *= 0.95 (reduce sensitivity)
     If missed_opportunity_rate > 0.2: wi *= 1.05 (increase sensitivity)
   ```
4. Adjust thresholds T similarly
5. Save new weights to `defaults.js` (or a `config` collection in MongoDB)
6. Log tuning event

---

## 8. API Endpoints

### REST (Express)

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/run` | Run code in Docker sandbox (public tests only) |
| POST | `/api/check` | Syntax-only compilation check |
| POST | `/api/submit` | Submit solution (run all tests including hidden) |
| GET | `/api/questions` | Get all questions (admin/analytics use) |
| GET | `/api/questions/:id` | Get question by ID |
| GET | `/api/sessions` | List sessions with candidate info (analytics) |
| GET | `/api/session/:id` | Get full session data (analytics/replay) |
| GET | `/api/session/:id/chat` | Get chat history for session |
| GET | `/api/session/:id/summary` | Get interview summary |
| POST | `/api/sessions/cleanup-empty` | Delete sessions with no events |
| GET | `/api/health` | Health check |

### Socket.io events are documented in section 5.1.

---

## 9. Frontend Layout

### Entry Screen (before interview -- like walking into the interview room):

```
+------------------------------------------+
|                                          |
|            CORTEX                        |
|       Coding Interview                   |
|                                          |
|  Welcome! Before we begin, please        |
|  introduce yourself.                     |
|                                          |
|   Name:  [_________________________]     |
|   Email: [_________________________]     |
|                                          |
|         [ Enter Interview Room ]         |
|                                          |
+------------------------------------------+
```

### Interview Screen (three resizable panes + timer):

```
+------------------------------------------------------------------+
|  Cortex   | Language: [Python v]  |  [ Run (Ctrl+Enter) ] [ Submit (Ctrl+Shift+Enter) ]
+------------------------------------------------------------------+
|  Timer: 12:34 / 45:00    ========================------   55%    |
+------------------------------------------------------------------+
|           |                            |                          |
| QUESTION  |       MONACO EDITOR        |      INTERVIEWER         |
|  PANEL    |   (pre-populated with      |      (Cortex)            |
|           |    function skeleton)       |                          |
| - Title   |                            |  Cortex: "Hi, I'm       |
| - Problem |                            |  Cortex. I'll be your   |
| - Concepts|----------------------------+  interviewer today.     |
| - Tests   |       OUTPUT PANEL         |  Take a moment to read  |
| - Edge    |                            |  the problem, and start |
|   cases   |  Test Results:             |  whenever you're ready."|
|           |  [pass] Test 1: [0,1]      |                          |
|           |  [fail] Test 2: ...        |  You: "Should I use a   |
|           |  Hidden: 2/4 passed        |  hash map here?"        |
|           |                            |                          |
|           |                            |  Cortex: "What makes    |
|           |                            |  you think a hash map   |
|           |                            |  would help here?"      |
|           |                            |                          |
|           |                            |  [________________] Send |
+------------------------------------------------------------------+
```

Panes are resizable via drag handles (inherited from innov8). No voice buttons. Keyboard shortcuts shown on buttons.

### Analytics Screen:

```
+------------------------------------------------------------------+
| Sessions                                                          |
+------------------------------------------------------------------+
| Name            | Email         | Lang   | Duration | Tests | Rating         |
| John Doe        | john@ex.com  | Python | 23:45    | 7/8   | Pass           |
| Jane Smith      | jane@ex.com  | Java   | 45:00    | 3/8   | Borderline     |
+------------------------------------------------------------------+

Click row -> Detail view:
  - Interview Summary (LLM-generated narrative)
  - Code Replay Player (pause/seek/rerun)
  - Performance Charts (struggle score, churn, test progression)
  - Timeline (interviewer interventions, candidate questions, paste events, tab-away bands, code runs)
```

---

## 10. Deployment (Oracle Cloud Free Tier)

### VM Specification:
- Shape: VM.Standard.A1.Flex (ARM)
- OCPUs: 4
- RAM: 24 GB
- Storage: 200 GB (boot volume)
- OS: Ubuntu 22.04

### Services running on VM:
1. **Node.js** (Cortex server, port 3000)
2. **Docker Engine** (for code sandboxes + warm pool)
3. **Nginx** (reverse proxy, ports 80/443)

Note: MongoDB runs on Atlas (cloud), NOT on the VM. This frees ~1GB RAM and CPU for Node.js and Docker containers. Session hot state lives in-memory on the server; Atlas handles persistence with ~20-50ms latency which is fine for non-blocking writes and cold reads (analytics/replay).

### Nginx config:
- SSL via Let's Encrypt (certbot)
- Proxy pass to Node.js on port 3000
- WebSocket upgrade support for Socket.io

### Process management:
- PM2 for Node.js (auto-restart, log rotation)
- systemd for Docker

### Startup sequence:
1. Docker engine starts (systemd)
2. Node.js starts (PM2) -> connects to Atlas via connection string -> triggers `containerPool.warmContainers()`
3. Nginx starts (systemd)

---

## 11. Environment Variables

```
# Required
GEMINI_API_KEY=your_gemini_api_key_here

# Optional (defaults shown)
MONGO_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/cortex?retryWrites=true&w=majority
PORT=3000
NODE_ENV=production
SESSION_TIME_LIMIT_MS=2700000
HEURISTIC_GRACE_PERIOD_MS=90000
HEURISTIC_COOLDOWN_MS=60000
OBSERVATION_WINDOW_MS=180000
RATE_LIMIT_TIER1=15
RATE_LIMIT_TIER2=25
RATE_LIMIT_COOLDOWN_TIER2_MS=30000
RATE_LIMIT_COOLDOWN_TIER3_MS=60000
INJECTION_COOLDOWN_MS=300000
RL_TUNING_INTERVAL_SESSIONS=20
CONTAINER_POOL_ENABLED=true
CONTAINER_POOL_TTL_MS=300000
SUMMARY_GENERATION_ENABLED=true
```

---

## 12. Migration from innov8

| innov8 Component | Cortex Equivalent |
|---|---|
| Express server (server.js) | `src/server/routes/execution.js` + `sessions.js` |
| FastAPI (ai_backend/) | `src/server/services/slmGateway.js` |
| Flask (gemini_chat_backend.py) | `src/server/services/interviewerBrain.js` |
| React frontend (frontend/) | `src/client/` |
| langchain-google-genai (Python) | `@google/generative-ai` (Node.js) |
| Motor (async Python Mongo) | Mongoose |
| diff_match_patch (Python) | `diff-match-patch` (npm) |
| In-memory Flask session dict | `src/server/services/sessionManager.js` |
| File-based logging (4 files) | MongoDB collections (chat_logs, snapshots) |
| HTTP polling (1.5s interval) | Socket.io (WebSocket) |
| No test case validation | `src/server/services/testCaseRunner.js` |
| No session recovery | localStorage + full hydration endpoint |
| No timer | `src/server/services/timerService.js` + `TimerBar.tsx` |
| No prompt guard | `src/server/services/promptGuard.js` |
| No RL feedback | `src/server/services/rlFeedbackLogger.js` |
| Auto-pushed hints | Natural interviewer behavior (proactive guidance) |
| Hello World default code | Function skeleton from `canonical_skeleton` |
| No candidate identity | `CandidateEntry.tsx` + `session.candidate` |
| No paste detection | PASTE events in telemetry |
| No tab tracking | TAB_AWAY/TAB_RETURN events |
| No keyboard shortcuts | `useKeyboardShortcuts.ts` |
| No interview summary | `summaryGenerator.js` + LLM post-session |
| Cold Docker starts | `containerPool.js` pre-warming |
| No Gemini fallback | Template-based fallback on API failure |

---

## 13. Out of Scope (For Now)

- Voice input/output (STT/TTS) -- will be added later
- Multi-file projects
- Collaborative editing (multiple candidates)
- Video proctoring
- Custom problem authoring UI (questions managed via JSON file)
- Candidate authentication/accounts (link-based access, no login)
- Dynamic problem routing mid-interview
- Admin dashboard for creating interviews (manual config for now)
